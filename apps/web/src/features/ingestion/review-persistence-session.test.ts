import {
  createEmptyDemoBrowserStorageSnapshot,
  type DemoBrowserStorageSnapshot,
} from "@hl7-data-mapper/contracts"
import { describe, expect, it } from "vitest"

import {
  applyReviewPersistenceResult,
  beginReviewPersistenceSession,
  type ReviewPersistenceSession,
} from "./review-persistence-session"

const BASE_SNAPSHOT = createEmptyDemoBrowserStorageSnapshot(
  "2026-08-20T12:00:00.000Z",
)
const NEXT_SNAPSHOT: DemoBrowserStorageSnapshot = {
  ...BASE_SNAPSHOT,
  updatedAt: "2026-08-20T12:01:00.000Z",
}

describe("review persistence session", () => {
  it("begins ready sessions from loaded and empty storage", () => {
    expect(
      beginReviewPersistenceSession({
        status: "loaded",
        snapshot: BASE_SNAPSHOT,
      }),
    ).toEqual({
      session: { status: "ready", baseSnapshot: BASE_SNAPSHOT },
      issue: null,
    })
    expect(beginReviewPersistenceSession({ status: "empty" })).toEqual({
      session: { status: "ready", baseSnapshot: null },
      issue: null,
    })
  })

  it.each(["invalid", "unavailable"] as const)(
    "blocks a session after an unsafe %s load",
    (status) => {
      const transition = beginReviewPersistenceSession(
        status === "invalid"
          ? { status }
          : { status, error: new Error("blocked") },
      )

      expect(transition).toEqual({
        session: { status: "blocked", issue: status },
        issue: status,
      })
    },
  )

  it("advances the optimistic base only after a successful save", () => {
    const session: ReviewPersistenceSession = {
      status: "ready",
      baseSnapshot: BASE_SNAPSHOT,
    }

    expect(
      applyReviewPersistenceResult({
        session,
        savedSnapshot: NEXT_SNAPSHOT,
        saveResult: { status: "saved" },
      }),
    ).toEqual({
      session: { status: "ready", baseSnapshot: NEXT_SNAPSHOT },
      issue: null,
    })
  })

  it("blocks conflicts and leaves unavailable writes retryable", () => {
    const session: ReviewPersistenceSession = {
      status: "ready",
      baseSnapshot: BASE_SNAPSHOT,
    }

    expect(
      applyReviewPersistenceResult({
        session,
        savedSnapshot: NEXT_SNAPSHOT,
        saveResult: { status: "conflict" },
      }),
    ).toEqual({
      session: { status: "blocked", issue: "conflict" },
      issue: "conflict",
    })
    expect(
      applyReviewPersistenceResult({
        session,
        savedSnapshot: NEXT_SNAPSHOT,
        saveResult: { status: "unavailable", error: new Error("full") },
      }),
    ).toEqual({ session, issue: "unavailable" })
  })
})
