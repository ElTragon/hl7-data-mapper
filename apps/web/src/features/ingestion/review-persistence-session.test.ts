import {
  createEmptyDemoBrowserStorageSnapshot,
  type DemoBrowserStorageSnapshot,
} from "@hl7-data-mapper/contracts"
import { describe, expect, it } from "vitest"

import {
  applyReviewPersistenceResult,
  applyReviewPersistenceResetResult,
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

  it.each([
    {
      resetResult: { status: "saved" } as const,
      expected: {
        session: { status: "ready", baseSnapshot: NEXT_SNAPSHOT },
        issue: null,
      },
    },
    {
      resetResult: { status: "conflict" } as const,
      expected: {
        session: { status: "blocked", issue: "conflict" },
        issue: "conflict",
      },
    },
    {
      resetResult: {
        status: "unavailable",
        error: new Error("blocked"),
      } as const,
      expected: {
        session: { status: "blocked", issue: "unavailable" },
        issue: "unavailable",
      },
    },
  ])("models reset result $resetResult.status", ({ resetResult, expected }) => {
    expect(
      applyReviewPersistenceResetResult({
        resetSnapshot: NEXT_SNAPSHOT,
        resetResult,
      }),
    ).toEqual(expected)
  })
})
