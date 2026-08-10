import type { ReviewableField } from "@hl7-data-mapper/contracts"
import { describe, expect, it } from "vitest"

import {
  confirmReviewableField,
  markReviewableFieldIncorrect,
  markReviewableFieldUnavailable,
} from "./review-decisions.js"

const field = {
  id: "patient-name",
  stepId: "patient",
  section: "patient",
  normalizedPath: "patient.name",
  label: "Patient name",
  value: "Lopez",
  hl7ItemId: "patient-name",
  primarySource: null,
  sources: [],
  rawSegment: null,
  transformHistory: [],
  validation: [],
  warnings: [],
  reviewStatus: "unreviewed",
  sourceCandidates: [],
} satisfies ReviewableField

describe("review decisions", () => {
  it("clears decision details when confirming a field", () => {
    const incorrect = markReviewableFieldIncorrect(field, {
      reasonCode: "wrong_source_mapping",
      reviewNote: "Wrong source",
    })
    expect(confirmReviewableField(incorrect)).toMatchObject({
      reviewStatus: "confirmed",
      reasonCode: null,
      reviewNote: null,
      correctionIntent: null,
    })
  })

  it("normalizes an incorrect decision note", () => {
    expect(
      markReviewableFieldIncorrect(field, {
        reviewNote: "  Needs review.  ",
      }),
    ).toMatchObject({
      reviewStatus: "incorrect",
      reviewNote: "Needs review.",
      correctionIntent: { targetHl7ItemId: "patient-name" },
    })
  })

  it("records an unavailable value without a replacement source", () => {
    expect(markReviewableFieldUnavailable(field)).toMatchObject({
      reviewStatus: "unavailable",
      correctionIntent: {
        targetHl7ItemId: "patient-name",
        replacementSource: null,
      },
    })
  })
})
