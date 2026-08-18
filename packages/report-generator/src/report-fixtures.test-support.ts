import {
  Hl7ItemSchema,
  NormalizedOutputSchema,
  ReportReviewDecisionSchema,
  ValidationSummarySchema,
  type MessageHash,
} from "@hl7-data-mapper/contracts"

import normalizedOutputFixture from "../../../fixtures/expected/oml-o21-basic.normalized.json"

import type {
  BuildReportPackageInput,
  ReportFile,
  ReportPackage,
} from "./types.js"

export const fakeHash: MessageHash =
  "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
export const messageHash: MessageHash =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

export const sampleHl7Item = Hl7ItemSchema.parse({
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
})

export const sampleReviewDecision = ReportReviewDecisionSchema.parse({
  fieldId: "patient-name",
  normalizedPath: "patient.name",
  hl7ItemId: "patient-name",
  reviewStatus: "confirmed",
  sourcePath: "PID-5.1",
  correctionApplied: false,
  updatedAt: "2026-07-09T00:31:00-07:00",
})

export function createReportInput(
  overrides: Partial<BuildReportPackageInput> = {},
): BuildReportPackageInput {
  return {
    appVersion: "0.1.0",
    generatedAt: "2026-07-09T00:30:00-07:00",
    clientId: "northstar-lab",
    profileId: "northstar-oml-o21",
    profileVersion: 3,
    messageHash,
    messageControlId: "MSG-20260706-0001",
    normalizedData: NormalizedOutputSchema.parse(normalizedOutputFixture),
    hl7Items: [sampleHl7Item],
    reviewDecisions: [sampleReviewDecision],
    validationResults: ValidationSummarySchema.parse({
      errors: [],
      warnings: [],
      info: [],
    }),
    ...overrides,
  }
}

export function findReportFile(
  reportPackage: ReportPackage,
  fileName: ReportFile["fileName"],
): ReportFile {
  const file = reportPackage.files.find(
    (candidate) => candidate.fileName === fileName,
  )

  if (!file) {
    throw new Error(`Expected report file ${fileName}.`)
  }

  return file
}
