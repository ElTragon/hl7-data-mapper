import {
  Hl7ItemSchema,
  NormalizedOutputSchema,
  ReportReviewDecisionSchema,
  ValidationSummarySchema,
} from "@hl7-data-mapper/contracts"

import type { BuildReportPackageInput } from "./types.js"

export function validateReportInput(
  input: BuildReportPackageInput,
): BuildReportPackageInput {
  if (
    input.sourcePolicy === "synthetic_source_included" &&
    !input.syntheticSourceText?.trim()
  ) {
    throw new Error(
      "syntheticSourceText is required when sourcePolicy is synthetic_source_included.",
    )
  }
  if (
    input.sourcePolicy !== "synthetic_source_included" &&
    input.syntheticSourceText
  ) {
    throw new Error(
      "syntheticSourceText can only be included with the synthetic_source_included policy.",
    )
  }
  return {
    ...input,
    normalizedData: NormalizedOutputSchema.parse(input.normalizedData),
    hl7Items: input.hl7Items.map((item) => Hl7ItemSchema.parse(item)),
    reviewDecisions: input.reviewDecisions.map((decision) =>
      ReportReviewDecisionSchema.parse(decision),
    ),
    validationResults: ValidationSummarySchema.parse(input.validationResults),
  }
}
