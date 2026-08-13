import { describe, expect, it } from "vitest"

import { buildReportPackage } from "./index.js"
import {
  createReportInput,
  fakeHash,
  findReportFile,
  messageHash,
} from "./test-fixtures.js"

describe("report rendering integration", () => {
  it("renders fallback text for unavailable and empty report data", async () => {
    const baseInput = createReportInput()
    const reportPackage = await buildReportPackage(
      createReportInput({
        messageControlId: undefined,
        normalizedData: {
          ...baseInput.normalizedData,
          guarantor: null,
        },
        reviewDecisions: [],
        validationResults: { errors: [], warnings: [], info: [] },
      }),
      () => fakeHash,
    )
    const markdown = findReportFile(reportPackage, "REPORT.md").content

    expect(markdown).toContain("Message control ID: Unavailable")
    expect(markdown).toContain("Guarantor present: No")
    expect(markdown).toContain("No review explanations were recorded.")
    expect(markdown).toContain("No validation issues were reported.")
  })

  it("creates human-readable Markdown and spreadsheet-friendly CSV", async () => {
    const reportPackage = await buildReportPackage(
      createReportInput({
        generatedAt: "2026-07-09T00:40:00-07:00",
        hl7Items: [],
        reviewDecisions: [
          {
            fieldId: "patient-name",
            normalizedPath: "patient.name",
            hl7ItemId: "patient-name",
            reviewStatus: "mapping_changed",
            sourcePath: "PID-5.1",
            correctionApplied: true,
            reasonCode: "wrong_source_mapping",
            reviewNote: "Client sends the middle name in a separate PID field.",
            updatedAt: "2026-07-09T00:41:00-07:00",
          },
          {
            fieldId: "lab-service-display",
            normalizedPath: "labOrders.0.service.display",
            hl7ItemId: "lab-service-display",
            reviewStatus: "confirmed",
            sourcePath: 'OBR-4.2,"alternate"',
            correctionApplied: false,
            updatedAt: "2026-07-09T00:42:00-07:00",
          },
        ],
        validationResults: {
          errors: [],
          warnings: [
            {
              code: "missing-specimen",
              severity: "warning",
              message: "Specimen is recommended.",
              section: "labOrders",
            },
          ],
          info: [],
        },
      }),
      ({ fileName }) => (fileName === "REPORT.md" ? fakeHash : messageHash),
    )
    const markdown = findReportFile(reportPackage, "REPORT.md").content
    const csv = findReportFile(reportPackage, "mapping-summary.csv").content

    expect(markdown).toContain("# HL7 Data Mapper Report")
    expect(markdown).toContain("App version: 0.1.0")
    expect(markdown).toContain("Lab orders found: 2")
    expect(markdown).toContain("Confirmed: 1")
    expect(markdown).toContain("Mapping changed: 1")
    expect(markdown).toContain("## Review explanations")
    expect(markdown).toContain("Wrong source mapping")
    expect(markdown).toContain(
      "Client sends the middle name in a separate PID field.",
    )
    expect(markdown).toContain("Warnings: 1")
    expect(markdown).toContain(
      "WARNING missing-specimen: Specimen is recommended.",
    )
    expect(csv).toContain(
      "section,targetPath,valueStatus,sourcePath,hl7ItemId,reviewStatus,transformApplied,reviewReason,reviewNote",
    )
    expect(csv).toContain(
      "patient,patient.name,mapping_changed,PID-5.1,patient-name,mapping_changed,source_replaced,Wrong source mapping,Client sends the middle name in a separate PID field.",
    )
    expect(csv).toContain(
      'labOrders,labOrders.0.service.display,confirmed,"OBR-4.2,""alternate""",lab-service-display,confirmed,,,',
    )
  })

  it("neutralizes spreadsheet formulas in generated CSV", async () => {
    const reportPackage = await buildReportPackage(
      createReportInput({
        hl7Items: [],
        reviewDecisions: [
          {
            fieldId: "patient-name",
            normalizedPath: "patient.name",
            hl7ItemId: "patient-name",
            reviewStatus: "confirmed",
            sourcePath: '=HYPERLINK("https://example.invalid")',
            correctionApplied: false,
            reviewNote: "=1+1",
            updatedAt: "2026-07-09T00:46:00-07:00",
          },
        ],
      }),
      () => fakeHash,
    )
    const csv = findReportFile(reportPackage, "mapping-summary.csv").content

    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"')
    expect(csv).toContain("'=1+1")
  })
})
