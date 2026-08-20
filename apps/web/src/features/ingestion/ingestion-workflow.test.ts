import { createSourceReference } from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import {
  confirmReviewableField,
  defaultOmlO21ClientProfile,
} from "@hl7-data-mapper/mapping-engine"
import { describe, expect, it } from "vitest"

import sampleHl7Message from "../../../../../fixtures/valid/oml-o21-basic.hl7?raw"
import { buildReviewWorkspaceSnapshot } from "./demo-storage"
import {
  changeReviewStep,
  createReviewWorkflow,
  applySourceCorrection,
  restoreStoredReviewDecisions,
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

  it("restores decisions only for the same message and normalized path", () => {
    const state = createState()
    const field = state.reviewFields[0]
    if (!field) throw new Error("Expected a reviewable field")
    const confirmedFields = [
      confirmReviewableField(field),
      ...state.reviewFields.slice(1),
    ]
    const snapshot = buildReviewWorkspaceSnapshot({
      previousSnapshot: null,
      profile: state.profile,
      reviewFields: confirmedFields,
      messageFingerprint: state.messageFingerprint,
      updatedAt: OCCURRED_AT,
    })

    expect(
      restoreStoredReviewDecisions({
        fields: state.reviewFields,
        messageFingerprint: state.messageFingerprint,
        storedSnapshot: snapshot,
      })[0]?.reviewStatus,
    ).toBe("confirmed")
    expect(
      restoreStoredReviewDecisions({
        fields: state.reviewFields,
        messageFingerprint: "ffffffffffffffff",
        storedSnapshot: snapshot,
      })[0]?.reviewStatus,
    ).toBe("unreviewed")

    const mismatchedPathSnapshot = {
      ...snapshot,
      reviewDecisions: snapshot.reviewDecisions.map((decision, index) =>
        index === 0
          ? { ...decision, normalizedPath: "patient.different" }
          : decision,
      ),
    }
    expect(
      restoreStoredReviewDecisions({
        fields: state.reviewFields,
        messageFingerprint: state.messageFingerprint,
        storedSnapshot: mismatchedPathSnapshot,
      })[0]?.reviewStatus,
    ).toBe("unreviewed")
  })

  it("does not restore unavailable onto a field with a collected value", () => {
    const state = createState()
    const valuedField = state.reviewFields.find(
      (field) => field.section !== "exceptions" && field.value,
    )
    if (!valuedField) throw new Error("Expected a collected field")
    const unavailableFields = state.reviewFields.map((field) =>
      field.id === valuedField.id
        ? { ...field, reviewStatus: "unavailable" as const }
        : field,
    )
    const snapshot = buildReviewWorkspaceSnapshot({
      previousSnapshot: null,
      profile: state.profile,
      reviewFields: unavailableFields,
      messageFingerprint: state.messageFingerprint,
      updatedAt: OCCURRED_AT,
    })

    const restored = restoreStoredReviewDecisions({
      fields: state.reviewFields,
      messageFingerprint: state.messageFingerprint,
      storedSnapshot: snapshot,
    })

    expect(
      restored.find((field) => field.id === valuedField.id)?.reviewStatus,
    ).toBe("unreviewed")
  })

  it("round-trips a composite correction intent through storage", () => {
    const state = createState()
    const field = state.reviewFields.find(
      (candidate) => candidate.hl7ItemId === "patient-name",
    )
    if (!field) throw new Error("Expected the patient-name field")
    const correctedAt = "2026-08-19T12:01:00.000Z"
    const correctedState = applySourceCorrection({
      state,
      field,
      source: createSourceReference({
        segment: "PID",
        field: 2,
        component: 1,
      }),
      sourceRole: "middle",
      occurredAt: correctedAt,
    })
    const snapshot = buildReviewWorkspaceSnapshot({
      previousSnapshot: null,
      profile: correctedState.profile,
      reviewFields: correctedState.reviewFields,
      messageFingerprint: correctedState.messageFingerprint,
      updatedAt: correctedAt,
    })
    const restoredState = createReviewWorkflow({
      parsedMessage: state.parsedMessage,
      sourceProfile: defaultOmlO21ClientProfile,
      storedSnapshot: snapshot,
      occurredAt: "2026-08-19T12:02:00.000Z",
    })
    const restoredField = restoredState.reviewFields.find(
      (candidate) => candidate.id === field.id,
    )

    expect(restoredField?.correctionIntent).toEqual(
      correctedState.reviewFields.find((candidate) => candidate.id === field.id)
        ?.correctionIntent,
    )

    const repersisted = buildReviewWorkspaceSnapshot({
      previousSnapshot: snapshot,
      profile: restoredState.profile,
      reviewFields: restoredState.reviewFields,
      messageFingerprint: restoredState.messageFingerprint,
      updatedAt: "2026-08-19T12:03:00.000Z",
    })
    expect(repersisted.correctionIntents).toEqual(snapshot.correctionIntents)
  })
})
