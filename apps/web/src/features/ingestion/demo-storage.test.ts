import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import {
  buildReviewableFields,
  confirmReviewableField,
  defaultOmlO21ClientProfile,
  executeMapping,
  markReviewableFieldIncorrect,
} from "@hl7-data-mapper/mapping-engine"
import { beforeEach, describe, expect, it, vi } from "vitest"

import sampleHl7Message from "../../../../../fixtures/valid/oml-o21-basic.hl7?raw"
import {
  browserDemoSnapshotStore,
  buildReviewWorkspaceSnapshot,
  createDemoDraftProfile,
  MAX_DEMO_AUDIT_EVENTS,
} from "./demo-storage"

const STORAGE_KEY = "hl7-data-mapper:demo-storage:v1"
const OCCURRED_AT = "2026-08-19T12:00:00.000Z"
const MESSAGE_FINGERPRINT = "0123456789abcdef"

function loadDemoSnapshot() {
  const result = browserDemoSnapshotStore.load()
  return result.status === "loaded" ? result.snapshot : null
}

function saveReviewWorkspaceSnapshot({
  profile,
  reviewFields,
  messageFingerprint,
  updatedAt,
}: Omit<
  Parameters<typeof buildReviewWorkspaceSnapshot>[0],
  "previousSnapshot"
>) {
  const loadResult = browserDemoSnapshotStore.load()
  const previousSnapshot =
    loadResult.status === "loaded" ? loadResult.snapshot : null

  return browserDemoSnapshotStore.save(
    buildReviewWorkspaceSnapshot({
      previousSnapshot,
      profile,
      reviewFields,
      messageFingerprint,
      updatedAt,
    }),
  )
}

function createWorkspace() {
  const parsedMessage = parseHl7Message(sampleHl7Message)
  const profile = createDemoDraftProfile({
    sourceProfile: defaultOmlO21ClientProfile,
    createdAt: OCCURRED_AT,
  })
  const mappingResult = executeMapping({ parsedMessage, profile })

  return {
    profile,
    reviewFields: buildReviewableFields({ mappingResult, profile }),
  }
}

describe("demo storage", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("treats malformed and schema-invalid snapshots as absent", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-json")
    expect(loadDemoSnapshot()).toBeNull()

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ storageVersion: 99 }),
    )
    expect(loadDemoSnapshot()).toBeNull()
  })

  it("persists review metadata without raw HL7 content", () => {
    const { profile, reviewFields } = createWorkspace()
    const privateValue = "PRIVATE-VALUE-DO-NOT-PERSIST"

    saveReviewWorkspaceSnapshot({
      profile,
      reviewFields: reviewFields.map((field, index) =>
        index === 0 ? { ...field, value: privateValue } : field,
      ),
      messageFingerprint: MESSAGE_FINGERPRINT,
      updatedAt: OCCURRED_AT,
    })

    const serialized = window.localStorage.getItem(STORAGE_KEY)
    const snapshot = loadDemoSnapshot()

    expect(snapshot?.draftProfiles).toEqual([profile])
    expect(snapshot?.reviewDecisions).toHaveLength(reviewFields.length)
    expect(snapshot?.reviewDecisions[0]?.messageFingerprint).toBe(
      MESSAGE_FINGERPRINT,
    )
    expect(serialized).not.toContain("MSH|")
    expect(serialized).not.toContain("PID|")
    expect(serialized).not.toContain(privateValue)
  })

  it("appends one audit event when a decision changes", () => {
    const { profile, reviewFields } = createWorkspace()
    saveReviewWorkspaceSnapshot({
      profile,
      reviewFields,
      messageFingerprint: MESSAGE_FINGERPRINT,
      updatedAt: OCCURRED_AT,
    })

    const field = reviewFields[0]
    if (!field) throw new Error("Expected a reviewable field")

    saveReviewWorkspaceSnapshot({
      profile,
      reviewFields: [
        markReviewableFieldIncorrect(field, {
          reasonCode: "wrong_source_mapping",
          reviewNote: "Use the client-specific source.",
        }),
        ...reviewFields.slice(1),
      ],
      messageFingerprint: MESSAGE_FINGERPRINT,
      updatedAt: "2026-08-19T12:01:00.000Z",
    })

    const snapshot = loadDemoSnapshot()
    expect(snapshot?.demoAuditEvents).toHaveLength(1)
    expect(snapshot?.demoAuditEvents[0]).toMatchObject({
      eventType: "review_decision_changed",
      metadata: {
        fieldId: field.id,
        previousStatus: "unreviewed",
        nextStatus: "incorrect",
        noteChanged: true,
      },
    })
  })

  it("does not append audit events when decisions are unchanged", () => {
    const { profile, reviewFields } = createWorkspace()

    for (const updatedAt of [OCCURRED_AT, "2026-08-19T12:01:00.000Z"]) {
      saveReviewWorkspaceSnapshot({
        profile,
        reviewFields,
        messageFingerprint: MESSAGE_FINGERPRINT,
        updatedAt,
      })
    }

    const snapshot = loadDemoSnapshot()
    expect(snapshot?.demoAuditEvents).toEqual([])
    expect(
      snapshot?.reviewDecisions.every(
        (decision) => decision.updatedAt === OCCURRED_AT,
      ),
    ).toBe(true)
  })

  it("updates only the changed decision timestamp", () => {
    const { profile, reviewFields } = createWorkspace()
    const firstSnapshot = buildReviewWorkspaceSnapshot({
      previousSnapshot: null,
      profile,
      reviewFields,
      messageFingerprint: MESSAGE_FINGERPRINT,
      updatedAt: OCCURRED_AT,
    })
    const field = reviewFields[0]
    if (!field) throw new Error("Expected a reviewable field")
    const changedAt = "2026-08-19T12:01:00.000Z"
    const nextSnapshot = buildReviewWorkspaceSnapshot({
      previousSnapshot: firstSnapshot,
      profile,
      reviewFields: [confirmReviewableField(field), ...reviewFields.slice(1)],
      messageFingerprint: MESSAGE_FINGERPRINT,
      updatedAt: changedAt,
    })

    expect(nextSnapshot.reviewDecisions[0]?.updatedAt).toBe(changedAt)
    expect(nextSnapshot.reviewDecisions[1]?.updatedAt).toBe(OCCURRED_AT)
  })

  it("builds snapshots without mutating its inputs", () => {
    const { profile, reviewFields } = createWorkspace()
    const originalProfile = structuredClone(profile)
    const originalFields = structuredClone(reviewFields)

    const snapshot = buildReviewWorkspaceSnapshot({
      previousSnapshot: null,
      profile,
      reviewFields,
      messageFingerprint: MESSAGE_FINGERPRINT,
      updatedAt: OCCURRED_AT,
    })

    expect(snapshot.updatedAt).toBe(OCCURRED_AT)
    expect(profile).toEqual(originalProfile)
    expect(reviewFields).toEqual(originalFields)
  })

  it("returns typed outcomes for unavailable browser storage", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError")
      })

    expect(browserDemoSnapshotStore.load()).toMatchObject({
      status: "unavailable",
    })
    getItem.mockRestore()

    const { profile, reviewFields } = createWorkspace()
    const snapshot = buildReviewWorkspaceSnapshot({
      previousSnapshot: null,
      profile,
      reviewFields,
      messageFingerprint: MESSAGE_FINGERPRINT,
      updatedAt: OCCURRED_AT,
    })
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Full", "QuotaExceededError")
      })

    expect(browserDemoSnapshotStore.save(snapshot)).toMatchObject({
      status: "unavailable",
    })
    setItem.mockRestore()
  })

  it("rejects a stale writer without replacing the current snapshot", () => {
    const { profile, reviewFields } = createWorkspace()
    const firstSnapshot = buildReviewWorkspaceSnapshot({
      previousSnapshot: null,
      profile,
      reviewFields,
      messageFingerprint: MESSAGE_FINGERPRINT,
      updatedAt: OCCURRED_AT,
    })
    expect(
      browserDemoSnapshotStore.save(firstSnapshot, {
        expectedSnapshot: null,
      }),
    ).toEqual({ status: "saved" })

    const currentSnapshot = {
      ...firstSnapshot,
      reviewDecisions: firstSnapshot.reviewDecisions.map((decision, index) =>
        index === 0
          ? { ...decision, reviewStatus: "confirmed" as const }
          : decision,
      ),
    }
    expect(browserDemoSnapshotStore.save(currentSnapshot)).toEqual({
      status: "saved",
    })

    expect(
      browserDemoSnapshotStore.save(firstSnapshot, {
        expectedSnapshot: firstSnapshot,
      }),
    ).toEqual({ status: "conflict" })
    expect(loadDemoSnapshot()?.reviewDecisions[0]?.reviewStatus).toBe(
      "confirmed",
    )
  })

  it("creates unique audit IDs when timestamps collide", () => {
    const { profile, reviewFields } = createWorkspace()
    const field = reviewFields[0]
    if (!field) throw new Error("Expected a reviewable field")
    const initial = buildReviewWorkspaceSnapshot({
      previousSnapshot: null,
      profile,
      reviewFields,
      messageFingerprint: MESSAGE_FINGERPRINT,
      updatedAt: OCCURRED_AT,
    })
    const incorrect = buildReviewWorkspaceSnapshot({
      previousSnapshot: initial,
      profile,
      reviewFields: [
        markReviewableFieldIncorrect(field),
        ...reviewFields.slice(1),
      ],
      messageFingerprint: MESSAGE_FINGERPRINT,
      updatedAt: OCCURRED_AT,
    })
    const confirmed = buildReviewWorkspaceSnapshot({
      previousSnapshot: incorrect,
      profile,
      reviewFields: [confirmReviewableField(field), ...reviewFields.slice(1)],
      messageFingerprint: MESSAGE_FINGERPRINT,
      updatedAt: OCCURRED_AT,
    })

    expect(
      new Set(confirmed.demoAuditEvents.map((event) => event.eventId)).size,
    ).toBe(confirmed.demoAuditEvents.length)
  })

  it("retains only the newest bounded audit history", () => {
    const { profile, reviewFields } = createWorkspace()
    const base = buildReviewWorkspaceSnapshot({
      previousSnapshot: null,
      profile,
      reviewFields,
      messageFingerprint: MESSAGE_FINGERPRINT,
      updatedAt: OCCURRED_AT,
    })
    const previousSnapshot = {
      ...base,
      demoAuditEvents: Array.from(
        { length: MAX_DEMO_AUDIT_EVENTS + 10 },
        (_, index) => ({
          eventId: `event-${index}`,
          eventType: "review_decision_changed" as const,
          actorType: "demo_user" as const,
          metadata: { index },
          createdAt: OCCURRED_AT,
        }),
      ),
    }
    const next = buildReviewWorkspaceSnapshot({
      previousSnapshot,
      profile,
      reviewFields,
      messageFingerprint: MESSAGE_FINGERPRINT,
      updatedAt: "2026-08-19T12:05:00.000Z",
    })

    expect(next.demoAuditEvents).toHaveLength(MAX_DEMO_AUDIT_EVENTS)
    expect(next.demoAuditEvents[0]?.eventId).toBe("event-10")
    expect(next.demoAuditEvents.at(-1)?.eventId).toBe(
      `event-${MAX_DEMO_AUDIT_EVENTS + 9}`,
    )
  })
})
