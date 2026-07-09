import { describe, expect, it } from "vitest"

import {
  NormalizedOutputSchema,
  REQUIRED_REPORT_FILE_NAMES,
  type MessageHash,
} from "@hl7-data-mapper/contracts"

import normalizedOutputFixture from "../../../fixtures/expected/oml-o21-basic.normalized.json"

import { buildReportPackage } from "./index.js"

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
            updatedAt: "2026-07-09T00:41:00-07:00",
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
    expect(markdown).toContain("Confirmed: 0")
    expect(markdown).toContain("Mapping changed: 1")
    expect(markdown).toContain("Warnings: 1")
    expect(markdown).toContain(
      "WARNING missing-specimen: Specimen is recommended.",
    )
    expect(csv).toContain(
      "section,targetPath,valueStatus,sourcePath,hl7ItemId,reviewStatus,transformApplied",
    )
    expect(csv).toContain(
      "patient,patient.name,mapping_changed,PID-5.1,patient-name,mapping_changed,source_replaced",
    )
  })
})
