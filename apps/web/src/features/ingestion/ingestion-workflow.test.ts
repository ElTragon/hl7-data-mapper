import { createSourceReference } from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import {
  confirmReviewableField,
  defaultOmlO21ClientProfile,
} from "@hl7-data-mapper/mapping-engine"
import { describe, expect, it } from "vitest"

import sampleHl7Message from "../../../../../fixtures/valid/oml-o21-basic.hl7?raw"
import { buildReviewWorkspaceSnapshot } from "./demo-storage"
import { buildReportReviewDecisions } from "./review-report"
import {
  mergeReviewFields,
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
        profile: state.profile,
        messageFingerprint: state.messageFingerprint,
        storedSnapshot: snapshot,
      })[0]?.reviewStatus,
    ).toBe("confirmed")
    expect(
      restoreStoredReviewDecisions({
        fields: state.reviewFields,
        profile: state.profile,
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
        profile: state.profile,
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
      profile: state.profile,
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

    expect(restoredField?.correctionIntent).toMatchObject({
      targetHl7ItemId: "patient-name",
      replacementSource: { path: "PID-2.1" },
      replacementHl7Item: { id: "patient-name" },
      notes: null,
    })

    const repersisted = buildReviewWorkspaceSnapshot({
      previousSnapshot: snapshot,
      profile: restoredState.profile,
      reviewFields: restoredState.reviewFields,
      messageFingerprint: restoredState.messageFingerprint,
      updatedAt: "2026-08-19T12:03:00.000Z",
    })
    expect(repersisted.correctionIntents).toEqual(snapshot.correctionIntents)
  })

  it("ignores a stored draft from an incompatible base profile version", () => {
    const state = createState()
    const snapshot = buildReviewWorkspaceSnapshot({
      previousSnapshot: null,
      profile: {
        ...state.profile,
        basedOnProfileVersion: 999,
        updatedAt: "2026-08-19T11:00:00.000Z",
      },
      reviewFields: state.reviewFields,
      messageFingerprint: state.messageFingerprint,
      updatedAt: "2026-08-19T11:00:00.000Z",
    })
    const occurredAt = "2026-08-19T13:00:00.000Z"
    const restored = createReviewWorkflow({
      parsedMessage: state.parsedMessage,
      sourceProfile: defaultOmlO21ClientProfile,
      storedSnapshot: snapshot,
      occurredAt,
    })

    expect(restored.profile.basedOnProfileVersion).toBe(
      defaultOmlO21ClientProfile.profileVersion,
    )
    expect(restored.profile.updatedAt).toBe(occurredAt)
  })
})

it("invalidates changed evidence while preserving unaffected decisions", () => {
  const state = createState()
  const previousFields = state.reviewFields.map(confirmReviewableField)
  const original = previousFields[0]!
  const nextFields = state.reviewFields.map((field, index) =>
    index === 0
      ? {
          ...field,
          primarySource: createSourceReference({ segment: "PID", field: 99 }),
        }
      : field,
  )
  const merged = mergeReviewFields({
    previousFields,
    nextFields,
    previousProfile: state.profile,
    nextProfile: state.profile,
    overrideFieldId: "none",
    overrideStatus: "mapping_changed",
    correctionIntent: null,
  })
  expect(merged[0]?.value).toEqual(original.value)
  expect(merged[0]?.reviewStatus).toBe("unreviewed")
  expect(merged[1]?.reviewStatus).toBe("confirmed")
})

it("does not restore decisions after mapping or review-engine revisions", () => {
  const state = createState()
  const snapshot = buildReviewWorkspaceSnapshot({
    previousSnapshot: null,
    profile: state.profile,
    reviewFields: state.reviewFields.map(confirmReviewableField),
    messageFingerprint: state.messageFingerprint,
    updatedAt: OCCURRED_AT,
  })
  for (const context of [
    { ...snapshot.reviewContext!, mappingRevision: "ffffffffffffffff" },
    { ...snapshot.reviewContext!, engineRevision: "future" },
  ]) {
    expect(
      restoreStoredReviewDecisions({
        fields: state.reviewFields,
        profile: state.profile,
        messageFingerprint: state.messageFingerprint,
        storedSnapshot: { ...snapshot, reviewContext: context },
      }).every((field) => field.reviewStatus === "unreviewed"),
    ).toBe(true)
  }
})

it("preserves applied correction history after confirmation and reload", () => {
  const state = createState()
  const field = state.reviewFields.find(
    (field) => field.hl7ItemId === "patient-name",
  )!
  const corrected = applySourceCorrection({
    state,
    field,
    source: createSourceReference({ segment: "PID", field: 2, component: 1 }),
    sourceRole: "middle",
    occurredAt: OCCURRED_AT,
  })
  const confirmed = updateReviewedField(
    corrected,
    confirmReviewableField(
      corrected.reviewFields.find((candidate) => candidate.id === field.id)!,
    ),
  )
  const snapshot = buildReviewWorkspaceSnapshot({
    previousSnapshot: null,
    profile: confirmed.profile,
    reviewFields: confirmed.reviewFields,
    messageFingerprint: confirmed.messageFingerprint,
    updatedAt: OCCURRED_AT,
  })
  for (const reviewStatus of [
    "confirmed",
    "incorrect",
    "unavailable",
  ] as const) {
    const reviewed = confirmed.reviewFields.find(
      (candidate) => candidate.id === field.id,
    )!
    expect(
      buildReportReviewDecisions(
        [{ ...reviewed, reviewStatus }],
        OCCURRED_AT,
      )[0]?.correctionApplied,
    ).toBe(true)
  }
  expect(snapshot.appliedCorrections).toHaveLength(1)
  expect(snapshot.correctionIntents).toHaveLength(0)
  const restored = createReviewWorkflow({
    parsedMessage: state.parsedMessage,
    sourceProfile: defaultOmlO21ClientProfile,
    storedSnapshot: snapshot,
    occurredAt: OCCURRED_AT,
  })
  expect(
    restored.reviewFields.find((candidate) => candidate.id === field.id),
  ).toMatchObject({
    reviewStatus: "confirmed",
    appliedCorrection: { replacementSource: { path: "PID-2.1" } },
  })
})

it("invalidates a dependent field when its mapping dependency changes even if its value does not", () => {
  const state = createState()
  const first = state.profile.itemSet.items[0]!,
    second = state.profile.itemSet.items[1]!
  const previousProfile = {
    ...state.profile,
    itemSet: {
      ...state.profile.itemSet,
      items: state.profile.itemSet.items.map((item) =>
        item.id === second.id ? { ...item, dependsOn: [first.id] } : item,
      ),
    },
  }
  const nextProfile = {
    ...previousProfile,
    itemSet: {
      ...previousProfile.itemSet,
      items: previousProfile.itemSet.items.map((item) =>
        item.id === first.id
          ? {
              ...item,
              sources: [createSourceReference({ segment: "PID", field: 99 })],
            }
          : item,
      ),
    },
  }
  const result = mergeReviewFields({
    previousFields: state.reviewFields.map(confirmReviewableField),
    nextFields: state.reviewFields,
    previousProfile,
    nextProfile,
    overrideFieldId: first.id,
    overrideStatus: "mapping_changed",
    correctionIntent: null,
  })
  expect(result.find((field) => field.id === second.id)?.reviewStatus).toBe(
    "unreviewed",
  )
  expect(result.find((field) => field.id === first.id)?.reviewStatus).toBe(
    "mapping_changed",
  )
  expect(
    result.find((field) => field.id === state.profile.itemSet.items[2]!.id)
      ?.reviewStatus,
  ).toBe("confirmed")
})

it("attaches corrections initiated from a warning to the mapped field", () => {
  const state = createState()
  const businessField = state.reviewFields.find(
    (field) => field.hl7ItemId === "patient-name",
  )!
  const warningField = {
    ...businessField,
    id: "issue:missing-source",
    section: "exceptions" as const,
    stepId: "warnings" as const,
  }
  const corrected = applySourceCorrection({
    state,
    field: warningField,
    source: createSourceReference({ segment: "PID", field: 2, component: 1 }),
    sourceRole: "middle",
    occurredAt: OCCURRED_AT,
  })
  expect(
    corrected.reviewFields.find((field) => field.id === businessField.id),
  ).toMatchObject({
    reviewStatus: "mapping_changed",
    appliedCorrection: { targetHl7ItemId: "patient-name" },
  })
})
