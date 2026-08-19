import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import {
  buildReviewableFields,
  defaultOmlO21ClientProfile,
  executeMapping,
  markReviewableFieldIncorrect,
} from "@hl7-data-mapper/mapping-engine"
import { beforeEach, describe, expect, it } from "vitest"

import sampleHl7Message from "../../../../../fixtures/valid/oml-o21-basic.hl7?raw"
import {
  createDemoDraftProfile,
  loadDemoSnapshot,
  saveReviewWorkspaceSnapshot,
} from "./demo-storage"

const STORAGE_KEY = "hl7-data-mapper:demo-storage:v1"
const OCCURRED_AT = "2026-08-19T12:00:00.000Z"
const MESSAGE_FINGERPRINT = "0123456789abcdef"

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

    saveReviewWorkspaceSnapshot({
      profile,
      reviewFields,
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

    expect(loadDemoSnapshot()?.demoAuditEvents).toEqual([])
  })
})
