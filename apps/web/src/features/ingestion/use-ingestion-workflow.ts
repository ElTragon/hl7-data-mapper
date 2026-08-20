import { useRef, useState } from "react"

import {
  resetDemoBrowserStorageSnapshot,
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
import {
  applyReviewPersistenceResult,
  applyReviewPersistenceResetResult,
  beginReviewPersistenceSession,
  type ReviewPersistenceIssue,
  type ReviewPersistenceSession,
} from "./review-persistence-session"

const STORAGE_ERROR_MESSAGE =
  "This review is available for this session, but browser storage could not be accessed safely."
const INVALID_STORAGE_MESSAGE =
  "Stored demo data is invalid and was preserved. Reset the demo to replace it."
const STORAGE_CONFLICT_MESSAGE =
  "Stored demo data changed in another session. Reload the message before saving again."
const STORAGE_CLEANUP_MESSAGE =
  "This review was saved, but older browser data could not be cleared. Check browser storage permissions and try again."

export function useIngestionWorkflow({
  store = browserDemoSnapshotStore,
  now = () => new Date().toISOString(),
}: {
  readonly store?: DemoSnapshotStore
  readonly now?: () => string
} = {}) {
  const [state, setState] = useState<ReviewWorkflowState | null>(null)
  const [storageIssue, setStorageIssueState] =
    useState<ReviewPersistenceIssue | null>(null)
  const stateRef = useRef<ReviewWorkflowState | null>(null)
  const persistenceSessionRef = useRef<ReviewPersistenceSession | null>(null)

  function replaceState(nextState: ReviewWorkflowState | null) {
    stateRef.current = nextState
    setState(nextState)
  }

  function setStorageIssue(issue: ReviewPersistenceIssue | null) {
    setStorageIssueState(issue)
  }

  function persist(nextState: ReviewWorkflowState, occurredAt: string) {
    const session = persistenceSessionRef.current
    if (!session) return
    if (session.status === "blocked") {
      setStorageIssue(session.issue)
      return
    }

    const previousSnapshot = session.baseSnapshot
    const nextSnapshot = buildReviewWorkspaceSnapshot({
      previousSnapshot,
      profile: nextState.profile,
      reviewFields: nextState.reviewFields,
      messageFingerprint: nextState.messageFingerprint,
      updatedAt: occurredAt,
    })
    const saveResult = store.save(nextSnapshot, {
      expectedSnapshot: previousSnapshot,
    })
    const transition = applyReviewPersistenceResult({
      session,
      savedSnapshot: nextSnapshot,
      saveResult,
    })

    persistenceSessionRef.current = transition.session
    setStorageIssue(transition.issue)
  }

  function initializeReview(
    parsedMessage: ParsedHl7Message,
    persistInitialSnapshot: boolean,
  ) {
    const occurredAt = now()
    const loadResult = store.load()
    const persistenceTransition = beginReviewPersistenceSession(loadResult)
    const nextState = createReviewWorkflow({
      parsedMessage,
      sourceProfile: defaultOmlO21ClientProfile,
      storedSnapshot:
        loadResult.status === "loaded" ? loadResult.snapshot : null,
      occurredAt,
    })

    replaceState(nextState)
    persistenceSessionRef.current = persistenceTransition.session

    if (persistenceTransition.session.status === "blocked") {
      setStorageIssue(persistenceTransition.issue)
      return
    }

    setStorageIssue(null)
    if (persistInitialSnapshot) persist(nextState, occurredAt)
  }

  function startReview(parsedMessage: ParsedHl7Message) {
    initializeReview(parsedMessage, true)
  }

  function reloadReview(parsedMessage: ParsedHl7Message) {
    initializeReview(parsedMessage, false)
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
    const resetSnapshot = resetDemoBrowserStorageSnapshot(occurredAt)
    const resetResult = store.reset(occurredAt)
    const transition = applyReviewPersistenceResetResult({
      resetSnapshot,
      resetResult,
    })
    persistenceSessionRef.current = transition.session
    setStorageIssue(transition.issue)

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
    storageIssue,
    storageError: storageIssueMessage(storageIssue),
    clear: () => {
      replaceState(null)
      persistenceSessionRef.current = null
      setStorageIssue(null)
    },
    startReview,
    reloadReview,
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

function storageIssueMessage(issue: ReviewPersistenceIssue | null) {
  switch (issue) {
    case "cleanup_failed":
      return STORAGE_CLEANUP_MESSAGE
    case "conflict":
      return STORAGE_CONFLICT_MESSAGE
    case "invalid":
      return INVALID_STORAGE_MESSAGE
    case "unavailable":
      return STORAGE_ERROR_MESSAGE
    case null:
      return null
  }
}
