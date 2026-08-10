import type { ReviewableField } from "@hl7-data-mapper/contracts"

import type { ReviewDecisionDetails } from "./types.js"

export function confirmReviewableField(
  field: ReviewableField,
): ReviewableField {
  return {
    ...field,
    reviewStatus: "confirmed",
    reasonCode: null,
    reviewNote: null,
    correctionIntent: null,
  }
}

export function markReviewableFieldIncorrect(
  field: ReviewableField,
  details: ReviewDecisionDetails = {},
): ReviewableField {
  return {
    ...field,
    reviewStatus: "incorrect",
    reasonCode: details.reasonCode ?? null,
    reviewNote: details.reviewNote?.trim() || null,
    correctionIntent: field.hl7ItemId
      ? { targetHl7ItemId: field.hl7ItemId }
      : null,
  }
}

export function markReviewableFieldUnavailable(
  field: ReviewableField,
  details: ReviewDecisionDetails = {},
): ReviewableField {
  return {
    ...field,
    reviewStatus: "unavailable",
    reasonCode: details.reasonCode ?? null,
    reviewNote: details.reviewNote?.trim() || null,
    correctionIntent: field.hl7ItemId
      ? { targetHl7ItemId: field.hl7ItemId, replacementSource: null }
      : null,
  }
}
