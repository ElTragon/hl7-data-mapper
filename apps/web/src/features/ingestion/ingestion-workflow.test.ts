import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import {
  confirmReviewableField,
  defaultOmlO21ClientProfile,
} from "@hl7-data-mapper/mapping-engine"
import { describe, expect, it } from "vitest"

import sampleHl7Message from "../../../../../fixtures/valid/oml-o21-basic.hl7?raw"
import {
  changeReviewStep,
  createReviewWorkflow,
  updateReviewedField,
} from "./ingestion-workflow"

const OCCURRED_AT = "2026-08-19T12:00:00.000Z"

function createState() {
  return createReviewWorkflow({
    parsedMessage: parseHl7Message(sampleHl7Message),
    sourceProfile: defaultOmlO21ClientProfile,
    storedSnapshot: null,
    occurredAt: OCCURRED_AT,
  })
}

describe("ingestion workflow", () => {
  it("creates a deterministic review state without mutating the profile", () => {
    const originalProfile = structuredClone(defaultOmlO21ClientProfile)
    const first = createState()
    const second = createState()

    expect(first).toEqual(second)
    expect(first.profile.updatedAt).toBe(OCCURRED_AT)
    expect(first.selectedFieldId).toBeTruthy()
    expect(defaultOmlO21ClientProfile).toEqual(originalProfile)
  })

  it("updates one reviewed field without mutating the previous state", () => {
    const state = createState()
    const field = state.reviewFields[0]
    if (!field) throw new Error("Expected a reviewable field")

    const nextState = updateReviewedField(state, confirmReviewableField(field))

    expect(nextState.reviewFields[0]?.reviewStatus).toBe("confirmed")
    expect(state.reviewFields[0]?.reviewStatus).toBe("unreviewed")
    expect(nextState.selectedFieldId).toBe(field.id)
  })

  it("selects the first field in a changed step", () => {
    const state = createState()
    const nextState = changeReviewStep(state, "labOrders")

    expect(nextState.activeStepId).toBe("labOrders")
    expect(nextState.selectedFieldId).toBe(
      state.reviewFields.find((field) => field.stepId === "labOrders")?.id ??
        null,
    )
  })
})
