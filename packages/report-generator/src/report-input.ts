import { assessReportReview } from "./review-completion.js"
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
  const parsed = {
    ...input,
    normalizedData: NormalizedOutputSchema.parse(input.normalizedData),
    hl7Items: input.hl7Items.map((item) => Hl7ItemSchema.parse(item)),
    reviewDecisions: input.reviewDecisions.map((decision) =>
      ReportReviewDecisionSchema.parse(decision),
    ),
    validationResults: ValidationSummarySchema.parse(input.validationResults),
  }
  if (
    parsed.validationResults.errors.some((issue) => issue.origin === "parser")
  )
    throw new Error("Parser errors must be resolved before export.")
  if (
    new Set(parsed.reviewDecisions.map((d) => d.fieldId)).size !==
    parsed.reviewDecisions.length
  )
    throw new Error("Report decisions must have unique field IDs.")
  if (
    input.requestedReviewStatus === "completed" &&
    assessReportReview(parsed).status !== "completed"
  )
    throw new Error(
      "Complete all required review decisions and resolve blocking errors before exporting a completed report.",
    )
  return parsed
}
