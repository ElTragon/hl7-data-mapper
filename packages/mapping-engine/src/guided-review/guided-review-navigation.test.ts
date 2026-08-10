import type { ReviewableField } from "@hl7-data-mapper/contracts"
import { describe, expect, it } from "vitest"

import {
  buildGuidedReviewNavigation,
  calculateGuidedReviewProgress,
} from "./guided-review-navigation.js"

function field(
  id: string,
  status: ReviewableField["reviewStatus"],
): ReviewableField {
  return {
    id,
    stepId: "patient",
    section: "patient",
    normalizedPath: `patient.${id}`,
    label: id,
    value: id,
    hl7ItemId: id,
    primarySource: null,
    sources: [],
    rawSegment: null,
    transformHistory: [],
    validation: [],
    warnings: [],
    reviewStatus: status,
    sourceCandidates: [],
  }
}

describe("guided review navigation", () => {
  it("counts every review status", () => {
    expect(
      calculateGuidedReviewProgress([
        field("one", "unreviewed"),
        field("two", "confirmed"),
        field("three", "incorrect"),
        field("four", "mapping_changed"),
        field("five", "unavailable"),
      ]),
    ).toEqual({
      total: 5,
      unreviewed: 1,
      confirmed: 1,
      incorrect: 1,
      mappingChanged: 1,
      unavailable: 1,
    })
  })

  it("does not complete empty steps", () => {
    const navigation = buildGuidedReviewNavigation({ fields: [] })
    expect(navigation.steps.every((step) => !step.isComplete)).toBe(true)
    expect(navigation.nextStepId).toBeNull()
  })
})
