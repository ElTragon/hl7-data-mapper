import { describe, expect, it } from "vitest"
import { strFromU8, unzipSync } from "fflate"

import {
  Hl7ItemSchema,
  NormalizedOutputSchema,
  REQUIRED_REPORT_FILE_NAMES,
  ReportReviewDecisionSchema,
  ValidationSummarySchema,
  type MessageHash,
} from "@hl7-data-mapper/contracts"

import normalizedOutputFixture from "../../../fixtures/expected/oml-o21-basic.normalized.json"

import { buildReportPackage, buildReportZip } from "./index.js"

const fakeHash: MessageHash =
  "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
const messageHash: MessageHash =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

describe("buildReportPackage", () => {
  it("builds all required report files in memory", async () => {
    const reportPackage = await buildReportPackage(
      {
        appVersion: "0.1.0",
        generatedAt: "2026-07-09T00:30:00-07:00",
        clientId: "northstar-lab",
        profileId: "northstar-oml-o21",
        profileVersion: 3,
        messageHash,
        messageControlId: "MSG-20260706-0001",
        normalizedData: NormalizedOutputSchema.parse(normalizedOutputFixture),
        hl7Items: [
          {
            id: "patient-name",
            clientId: "northstar-lab",
            sequence: 1,
            section: "patient",
            targetPath: "patient.name",
            label: "Patient name",
            action: "extract",
            valueType: "person_name",
            sources: [
              {
                path: "PID-5.1",
                segment: "PID",
                field: 5,
                component: 1,
              },
            ],
            dependsOn: [],
            required: true,
            reviewRequired: true,
          },
        ],
        reviewDecisions: [
          {
            fieldId: "patient-name",
            normalizedPath: "patient.name",
            hl7ItemId: "patient-name",
            reviewStatus: "confirmed",
            sourcePath: "PID-5.1",
            correctionApplied: false,
            updatedAt: "2026-07-09T00:31:00-07:00",
          },
        ],
        validationResults: {
          errors: [],
          warnings: [],
          info: [],
        },
      },
      () => fakeHash,
    )

    expect(reportPackage.files.map((file) => file.fileName)).toEqual(
      REQUIRED_REPORT_FILE_NAMES,
    )
    expect(reportPackage.manifest).toMatchObject({
      appVersion: "0.1.0",
      clientId: "northstar-lab",
      profileId: "northstar-oml-o21",
      profileVersion: 3,
      messageHash,
      sourcePolicy: "raw_source_excluded",
    })
    expect(reportPackage.manifest.includedFiles).toHaveLength(6)
    expect(reportPackage.files.map((file) => file.fileName)).not.toContain(
      "source.hl7",
    )
  })

  it("reproduces report package files for identical inputs", async () => {
    const input = {
      appVersion: "0.1.0",
      generatedAt: "2026-07-09T00:32:00-07:00",
      clientId: "northstar-lab",
      profileId: "northstar-oml-o21",
      profileVersion: 3,
      messageHash,
      normalizedData: NormalizedOutputSchema.parse(normalizedOutputFixture),
      hl7Items: [
        Hl7ItemSchema.parse({
          id: "patient-name",
          clientId: "northstar-lab",
          sequence: 1,
          section: "patient",
          targetPath: "patient.name",
          label: "Patient name",
          action: "extract",
          valueType: "person_name",
          sources: [
            {
              path: "PID-5.1",
              segment: "PID",
              field: 5,
              component: 1,
            },
          ],
        }),
      ],
      reviewDecisions: [
        ReportReviewDecisionSchema.parse({
          fieldId: "patient-name",
          normalizedPath: "patient.name",
          hl7ItemId: "patient-name",
          reviewStatus: "confirmed",
          sourcePath: "PID-5.1",
          correctionApplied: false,
          updatedAt: "2026-07-09T00:33:00-07:00",
        }),
      ],
      validationResults: ValidationSummarySchema.parse({
        errors: [],
        warnings: [],
        info: [],
      }),
    }

    const firstPackage = await buildReportPackage(input, () => fakeHash)
    const secondPackage = await buildReportPackage(input, () => fakeHash)

    expect(firstPackage.manifest).toEqual(secondPackage.manifest)
    expect(firstPackage.files).toEqual(secondPackage.files)
  })

  it("emits valid machine-readable JSON payloads", async () => {
    const reportPackage = await buildReportPackage(
      {
        appVersion: "0.1.0",
        generatedAt: "2026-07-09T00:35:00-07:00",
        clientId: "northstar-lab",
        profileId: "northstar-oml-o21",
        profileVersion: 3,
        messageHash,
        normalizedData: NormalizedOutputSchema.parse(normalizedOutputFixture),
        hl7Items: [
          Hl7ItemSchema.parse({
            id: "patient-name",
            clientId: "northstar-lab",
            sequence: 1,
            section: "patient",
            targetPath: "patient.name",
            label: "Patient name",
            action: "extract",
            valueType: "person_name",
            sources: [
              {
                path: "PID-5.1",
                segment: "PID",
                field: 5,
                component: 1,
              },
            ],
          }),
        ],
        reviewDecisions: [
          {
            fieldId: "patient-name",
            normalizedPath: "patient.name",
            hl7ItemId: "patient-name",
            reviewStatus: "confirmed",
            sourcePath: "PID-5.1",
            updatedAt: "2026-07-09T00:36:00-07:00",
            correctionApplied: false,
          },
        ],
        validationResults: {
          errors: [],
          warnings: [],
          info: [],
        },
      },
      () => fakeHash,
    )
    const fileByName = new Map(
      reportPackage.files.map((file) => [file.fileName, file.content]),
    )

    expect(() =>
      NormalizedOutputSchema.parse(
        JSON.parse(fileByName.get("normalized-data.json") ?? ""),
      ),
    ).not.toThrow()
    expect(() =>
      Hl7ItemSchema.array().parse(
        JSON.parse(fileByName.get("hl7-items.json") ?? ""),
      ),
    ).not.toThrow()
    expect(() =>
      ReportReviewDecisionSchema.array().parse(
        JSON.parse(fileByName.get("review-decisions.json") ?? ""),
      ),
    ).not.toThrow()
    expect(() =>
      ValidationSummarySchema.parse(
        JSON.parse(fileByName.get("validation-results.json") ?? ""),
      ),
    ).not.toThrow()
  })

  it("creates human-readable markdown and spreadsheet-friendly CSV", async () => {
    const reportPackage = await buildReportPackage(
      {
        appVersion: "0.1.0",
        generatedAt: "2026-07-09T00:40:00-07:00",
        clientId: "northstar-lab",
        profileId: "northstar-oml-o21",
        profileVersion: 3,
        messageHash,
        normalizedData: NormalizedOutputSchema.parse(normalizedOutputFixture),
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
      },
      ({ fileName }) => (fileName === "REPORT.md" ? fakeHash : messageHash),
    )

    const markdown = reportPackage.files.find(
      (file) => file.fileName === "REPORT.md",
    )?.content
    const csv = reportPackage.files.find(
      (file) => file.fileName === "mapping-summary.csv",
    )?.content

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

  it("neutralizes spreadsheet formulas in mapping summary CSV cells", async () => {
    const reportPackage = await buildReportPackage(
      {
        appVersion: "0.1.0",
        generatedAt: "2026-07-09T00:45:00-07:00",
        clientId: "northstar-lab",
        profileId: "northstar-oml-o21",
        profileVersion: 3,
        messageHash,
        normalizedData: NormalizedOutputSchema.parse(normalizedOutputFixture),
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
        validationResults: {
          errors: [],
          warnings: [],
          info: [],
        },
      },
      () => fakeHash,
    )
    const csv = reportPackage.files.find(
      (file) => file.fileName === "mapping-summary.csv",
    )?.content

    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"')
    expect(csv).toContain("'=1+1")
  })

  it("includes source.hl7 only for explicitly synthetic source reports", async () => {
    const reportPackage = await buildReportPackage(
      {
        appVersion: "0.1.0",
        generatedAt: "2026-07-09T00:47:00-07:00",
        clientId: "northstar-lab",
        profileId: "northstar-oml-o21",
        profileVersion: 3,
        messageHash,
        sourcePolicy: "synthetic_source_included",
        syntheticSourceText:
          "MSH|^~\\&|SYNTHETIC|LAB|HL7_MAPPER|DEMO|202607090047||OML^O21^OML_O21|MSG1|P|2.5.1\r",
        normalizedData: NormalizedOutputSchema.parse(normalizedOutputFixture),
        hl7Items: [],
        reviewDecisions: [],
        validationResults: {
          errors: [],
          warnings: [],
          info: [],
        },
      },
      () => fakeHash,
    )
    const zipPackage = buildReportZip(reportPackage, {
      rootFolderName: "northstar-lab",
    })

    expect(reportPackage.files.map((file) => file.fileName)).toContain(
      "source.hl7",
    )
    expect(reportPackage.manifest).toMatchObject({
      sourcePolicy: "synthetic_source_included",
    })
    expect(reportPackage.manifest.includedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: "source.hl7",
          mediaType: "text/plain",
        }),
      ]),
    )
    expect(zipPackage.entries.map((entry) => entry.path)).toContain(
      "northstar-lab/source.hl7",
    )
  })

  it("rejects source text unless the report policy marks it synthetic", async () => {
    await expect(() =>
      buildReportPackage(
        {
          appVersion: "0.1.0",
          generatedAt: "2026-07-09T00:48:00-07:00",
          clientId: "northstar-lab",
          profileId: "northstar-oml-o21",
          profileVersion: 3,
          messageHash,
          syntheticSourceText:
            "MSH|^~\\&|SYNTHETIC|LAB|HL7_MAPPER|DEMO|202607090048||OML^O21^OML_O21|MSG1|P|2.5.1\r",
          normalizedData: NormalizedOutputSchema.parse(normalizedOutputFixture),
          hl7Items: [],
          reviewDecisions: [],
          validationResults: {
            errors: [],
            warnings: [],
            info: [],
          },
        },
        () => fakeHash,
      ),
    ).rejects.toThrow(
      "syntheticSourceText can only be included with the synthetic_source_included policy.",
    )

    await expect(() =>
      buildReportPackage(
        {
          appVersion: "0.1.0",
          generatedAt: "2026-07-09T00:49:00-07:00",
          clientId: "northstar-lab",
          profileId: "northstar-oml-o21",
          profileVersion: 3,
          messageHash,
          sourcePolicy: "synthetic_source_included",
          normalizedData: NormalizedOutputSchema.parse(normalizedOutputFixture),
          hl7Items: [],
          reviewDecisions: [],
          validationResults: {
            errors: [],
            warnings: [],
            info: [],
          },
        },
        () => fakeHash,
      ),
    ).rejects.toThrow(
      "syntheticSourceText is required when sourcePolicy is synthetic_source_included.",
    )
  })

  it("builds a downloadable ZIP archive with the report files", async () => {
    const reportPackage = await buildReportPackage(
      {
        appVersion: "0.1.0",
        generatedAt: "2026-07-09T00:50:00-07:00",
        clientId: "northstar-lab",
        profileId: "northstar-oml-o21",
        profileVersion: 3,
        messageHash,
        normalizedData: NormalizedOutputSchema.parse(normalizedOutputFixture),
        hl7Items: [],
        reviewDecisions: [],
        validationResults: {
          errors: [],
          warnings: [],
          info: [],
        },
      },
      () => fakeHash,
    )
    const zipPackage = buildReportZip(reportPackage)
    const unzippedFiles = unzipSync(zipPackage.content)

    expect(zipPackage).toMatchObject({
      fileName: "hl7-data-mapper-report.zip",
      mediaType: "application/zip",
    })
    expect(zipPackage.entries.map((entry) => entry.path)).toEqual(
      REQUIRED_REPORT_FILE_NAMES.map(
        (fileName) => `hl7-data-mapper-report/${fileName}`,
      ),
    )
    expect(Object.keys(unzippedFiles).sort()).toEqual(
      REQUIRED_REPORT_FILE_NAMES.map(
        (fileName) => `hl7-data-mapper-report/${fileName}`,
      ).sort(),
    )
    expect(
      strFromU8(unzippedFiles["hl7-data-mapper-report/manifest.json"] ?? []),
    ).toContain('"appName": "HL7 Data Mapper"')
    expect(
      strFromU8(unzippedFiles["hl7-data-mapper-report/REPORT.md"] ?? []),
    ).toContain("# HL7 Data Mapper Report")
    expect(
      zipPackage.entries.every((entry) => entry.uncompressedSize > 0),
    ).toBe(true)
    expect(zipPackage.content.byteLength).toBeGreaterThan(0)
  })

  it("supports custom ZIP folder names", async () => {
    const reportPackage = await buildReportPackage(
      {
        appVersion: "0.1.0",
        generatedAt: "2026-07-09T00:55:00-07:00",
        clientId: "northstar-lab",
        profileId: "northstar-oml-o21",
        profileVersion: 3,
        messageHash,
        normalizedData: NormalizedOutputSchema.parse(normalizedOutputFixture),
        hl7Items: [],
        reviewDecisions: [],
        validationResults: {
          errors: [],
          warnings: [],
          info: [],
        },
      },
      () => fakeHash,
    )
    const zipPackage = buildReportZip(reportPackage, {
      rootFolderName: "custom/report",
    })

    expect(zipPackage.fileName).toBe("custom-report.zip")
    expect(zipPackage.entries[0]?.path).toBe("custom-report/REPORT.md")
  })
})
