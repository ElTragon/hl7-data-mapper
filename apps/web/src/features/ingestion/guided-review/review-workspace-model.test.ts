import type { ReviewableField } from "@hl7-data-mapper/contracts"
import { describe, expect, it } from "vitest"

import {
  buildReviewWorkspaceSummary,
  getEffectiveReviewStatus,
  resolveSelectedReviewField,
} from "./review-workspace-model"

function reviewField(
  overrides: Partial<ReviewableField> = {},
): ReviewableField {
  return {
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
    ...overrides,
  }
}

describe("review workspace model", () => {
  it("keeps selection inside the active review step", () => {
    const patientField = reviewField()

    expect(
      resolveSelectedReviewField({
        activeFields: [patientField],
        selectedFieldId: "sender-name",
      }),
    ).toBe(patientField)
    expect(
      resolveSelectedReviewField({
        activeFields: [],
        selectedFieldId: patientField.id,
      }),
    ).toBeNull()
  })

  it("uses the same effective status for badges and progress", () => {
    const invalidUnavailableField = reviewField({
      reviewStatus: "unavailable",
      value: "Lopez",
    })

    expect(getEffectiveReviewStatus(invalidUnavailableField)).toBe("unreviewed")
    expect(buildReviewWorkspaceSummary([invalidUnavailableField])).toEqual({
      reviewPercent: 0,
      mappingChangeCount: 0,
      unresolvedCount: 1,
    })
  })
})
