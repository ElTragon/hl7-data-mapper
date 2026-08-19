import { useRef, useState } from "react"

import {
  type GuidedReviewStepId,
  type ReviewableField,
  type SourceReference,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"
import {
  defaultOmlO21ClientProfile,
  type PersonNameSourceRole,
} from "@hl7-data-mapper/mapping-engine"

import {
  browserDemoSnapshotStore,
  buildReviewWorkspaceSnapshot,
  type DemoSnapshotStore,
} from "./demo-storage"
import {
  applySourceCorrection,
  changeReviewStep,
  createReviewWorkflow,
  updateReviewedField,
  type ReviewWorkflowState,
} from "./ingestion-workflow"

const STORAGE_ERROR_MESSAGE =
  "This review is available for this session, but browser storage could not save it."

export function useIngestionWorkflow({
  store = browserDemoSnapshotStore,
  now = () => new Date().toISOString(),
}: {
  readonly store?: DemoSnapshotStore
  readonly now?: () => string
} = {}) {
  const [state, setState] = useState<ReviewWorkflowState | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const stateRef = useRef<ReviewWorkflowState | null>(null)

  function replaceState(nextState: ReviewWorkflowState | null) {
    stateRef.current = nextState
    setState(nextState)
  }

  function persist(nextState: ReviewWorkflowState, occurredAt: string) {
    const loadResult = store.load()
    const previousSnapshot =
      loadResult.status === "loaded" ? loadResult.snapshot : null
    const saveResult = store.save(
      buildReviewWorkspaceSnapshot({
        previousSnapshot,
        profile: nextState.profile,
        reviewFields: nextState.reviewFields,
        messageFingerprint: nextState.messageFingerprint,
        updatedAt: occurredAt,
      }),
    )

    setStorageError(
      loadResult.status === "unavailable" || saveResult.status === "unavailable"
        ? STORAGE_ERROR_MESSAGE
        : null,
    )
  }

  function startReview(parsedMessage: ParsedHl7Message) {
    const occurredAt = now()
    const loadResult = store.load()
    const nextState = createReviewWorkflow({
      parsedMessage,
      sourceProfile: defaultOmlO21ClientProfile,
      storedSnapshot:
        loadResult.status === "loaded" ? loadResult.snapshot : null,
      occurredAt,
    })

    replaceState(nextState)
    const saveResult = store.save(
      buildReviewWorkspaceSnapshot({
        previousSnapshot:
          loadResult.status === "loaded" ? loadResult.snapshot : null,
        profile: nextState.profile,
        reviewFields: nextState.reviewFields,
        messageFingerprint: nextState.messageFingerprint,
        updatedAt: occurredAt,
      }),
    )
    setStorageError(
      loadResult.status === "unavailable" || saveResult.status === "unavailable"
        ? STORAGE_ERROR_MESSAGE
        : null,
    )
  }

  function commit(
    update: (
      current: ReviewWorkflowState,
      occurredAt: string,
    ) => ReviewWorkflowState,
  ) {
    const current = stateRef.current
    if (!current) return

    const occurredAt = now()
    const nextState = update(current, occurredAt)
    replaceState(nextState)
    persist(nextState, occurredAt)
  }

  function reset(parsedMessage: ParsedHl7Message | null) {
    const occurredAt = now()
    const resetResult = store.reset(occurredAt)
    setStorageError(
      resetResult.status === "unavailable" ? STORAGE_ERROR_MESSAGE : null,
    )

    if (!parsedMessage || parsedMessage.errors.length > 0) {
      replaceState(null)
      return
    }

    replaceState(
      createReviewWorkflow({
        parsedMessage,
        sourceProfile: defaultOmlO21ClientProfile,
        storedSnapshot: null,
        occurredAt,
      }),
    )
  }

  function updateView(
    update: (current: ReviewWorkflowState) => ReviewWorkflowState,
  ) {
    const current = stateRef.current
    if (current) replaceState(update(current))
  }

  return {
    state,
    storageError,
    clear: () => replaceState(null),
    startReview,
    updateField: (field: ReviewableField) =>
      commit((current) => updateReviewedField(current, field)),
    changeStep: (stepId: GuidedReviewStepId) =>
      updateView((current) => changeReviewStep(current, stepId)),
    selectField: (selectedFieldId: string | null) =>
      updateView((current) => ({ ...current, selectedFieldId })),
    applySource: (
      field: ReviewableField,
      source: SourceReference,
      sourceRole?: PersonNameSourceRole,
    ) =>
      commit((current, occurredAt) =>
        applySourceCorrection({
          state: current,
          field,
          source,
          sourceRole,
          occurredAt,
        }),
      ),
    reset,
  }
}
