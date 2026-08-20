import type { DemoBrowserStorageSnapshot } from "@hl7-data-mapper/contracts"

import type { SnapshotLoadResult, SnapshotSaveResult } from "./demo-storage"

export type ReviewPersistenceIssue = "conflict" | "invalid" | "unavailable"

export type ReviewPersistenceSession =
  | {
      readonly status: "ready"
      readonly baseSnapshot: DemoBrowserStorageSnapshot | null
    }
  | {
      readonly status: "blocked"
      readonly issue: ReviewPersistenceIssue
    }

export type ReviewPersistenceTransition = {
  readonly session: ReviewPersistenceSession
  readonly issue: ReviewPersistenceIssue | null
}

export function beginReviewPersistenceSession(
  loadResult: SnapshotLoadResult,
): ReviewPersistenceTransition {
  switch (loadResult.status) {
    case "loaded":
      return {
        session: { status: "ready", baseSnapshot: loadResult.snapshot },
        issue: null,
      }
    case "empty":
      return {
        session: { status: "ready", baseSnapshot: null },
        issue: null,
      }
    case "invalid":
      return {
        session: { status: "blocked", issue: "invalid" },
        issue: "invalid",
      }
    case "unavailable":
      return {
        session: { status: "blocked", issue: "unavailable" },
        issue: "unavailable",
      }
  }
}

export function applyReviewPersistenceResult({
  session,
  savedSnapshot,
  saveResult,
}: {
  readonly session: ReviewPersistenceSession
  readonly savedSnapshot: DemoBrowserStorageSnapshot
  readonly saveResult: SnapshotSaveResult
}): ReviewPersistenceTransition {
  if (session.status === "blocked") {
    return { session, issue: session.issue }
  }

  switch (saveResult.status) {
    case "saved":
      return {
        session: { status: "ready", baseSnapshot: savedSnapshot },
        issue: null,
      }
    case "conflict":
      return {
        session: { status: "blocked", issue: "conflict" },
        issue: "conflict",
      }
    case "unavailable":
      return { session, issue: "unavailable" }
  }
}
