import { act, renderHook } from "@testing-library/react"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { confirmReviewableField } from "@hl7-data-mapper/mapping-engine"
import { describe, expect, it, vi } from "vitest"

import sampleHl7Message from "../../../../../fixtures/valid/oml-o21-basic.hl7?raw"
import type {
  DemoSnapshotStore,
  SnapshotLoadResult,
  SnapshotSaveResult,
} from "./demo-storage"
import type { DemoBrowserStorageSnapshot } from "@hl7-data-mapper/contracts"
import { useIngestionWorkflow } from "./use-ingestion-workflow"

const FIRST_TIME = "2026-08-20T12:00:00.000Z"
const SECOND_TIME = "2026-08-20T12:01:00.000Z"

function createMemoryStore(
  initialSnapshot: DemoBrowserStorageSnapshot | null = null,
) {
  let snapshot = initialSnapshot
  const save = vi.fn(
    (
      nextSnapshot: DemoBrowserStorageSnapshot,
      options: Parameters<DemoSnapshotStore["save"]>[1] = {},
    ): SnapshotSaveResult => {
      if (
        "expectedSnapshot" in options &&
        JSON.stringify(snapshot) !== JSON.stringify(options.expectedSnapshot)
      ) {
        return { status: "conflict" }
      }

      snapshot = nextSnapshot
      return { status: "saved" }
    },
  )
  const reset = vi.fn((): SnapshotSaveResult => {
    snapshot = null
    return { status: "saved" }
  })
  const store: DemoSnapshotStore = {
    load: vi.fn((): SnapshotLoadResult =>
      snapshot ? { status: "loaded", snapshot } : { status: "empty" },
    ),
    save,
    reset,
  }

  return { store, save, reset, getSnapshot: () => snapshot }
}

describe("use ingestion workflow", () => {
  it("uses one injected timestamp to start and persist a review", () => {
    const memory = createMemoryStore()
    const now = vi.fn(() => FIRST_TIME)
    const { result } = renderHook(() =>
      useIngestionWorkflow({ store: memory.store, now }),
    )

    act(() => result.current.startReview(parseHl7Message(sampleHl7Message)))

    expect(now).toHaveBeenCalledTimes(1)
    expect(result.current.state?.profile.updatedAt).toBe(FIRST_TIME)
    expect(memory.getSnapshot()?.updatedAt).toBe(FIRST_TIME)
    expect(
      memory
        .getSnapshot()
        ?.reviewDecisions.every(
          (decision) => decision.updatedAt === FIRST_TIME,
        ),
    ).toBe(true)
  })

  it("does not persist view-only navigation", () => {
    const memory = createMemoryStore()
    const { result } = renderHook(() =>
      useIngestionWorkflow({ store: memory.store, now: () => FIRST_TIME }),
    )
    act(() => result.current.startReview(parseHl7Message(sampleHl7Message)))
    memory.save.mockClear()

    act(() => {
      result.current.changeStep("labOrders")
      result.current.selectField(null)
    })

    expect(memory.save).not.toHaveBeenCalled()
    expect(result.current.state?.activeStepId).toBe("labOrders")
    expect(result.current.state?.selectedFieldId).toBeNull()
  })

  it("preserves consecutive field updates before React rerenders", () => {
    const memory = createMemoryStore()
    const times = [FIRST_TIME, SECOND_TIME, SECOND_TIME]
    const { result } = renderHook(() =>
      useIngestionWorkflow({
        store: memory.store,
        now: () => times.shift() ?? SECOND_TIME,
      }),
    )
    act(() => result.current.startReview(parseHl7Message(sampleHl7Message)))
    const first = result.current.state?.reviewFields[0]
    const second = result.current.state?.reviewFields[1]
    if (!first || !second) throw new Error("Expected two review fields")

    act(() => {
      result.current.updateField(confirmReviewableField(first))
      result.current.updateField(confirmReviewableField(second))
    })

    expect(result.current.state?.reviewFields[0]?.reviewStatus).toBe(
      "confirmed",
    )
    expect(result.current.state?.reviewFields[1]?.reviewStatus).toBe(
      "confirmed",
    )
    expect(memory.getSnapshot()?.reviewDecisions[0]?.reviewStatus).toBe(
      "confirmed",
    )
    expect(memory.getSnapshot()?.reviewDecisions[1]?.reviewStatus).toBe(
      "confirmed",
    )
  })

  it.each(["invalid", "unavailable"] as const)(
    "keeps the review in memory and does not save after an %s load",
    (status) => {
      const save = vi.fn<DemoSnapshotStore["save"]>(() => ({ status: "saved" }))
      const store: DemoSnapshotStore = {
        load: () =>
          status === "invalid"
            ? { status: "invalid" }
            : { status: "unavailable", error: new Error("blocked") },
        save,
        reset: () => ({ status: "saved" }),
      }
      const { result } = renderHook(() =>
        useIngestionWorkflow({ store, now: () => FIRST_TIME }),
      )

      act(() => result.current.startReview(parseHl7Message(sampleHl7Message)))

      expect(result.current.state).not.toBeNull()
      expect(result.current.storageError).not.toBeNull()
      expect(save).not.toHaveBeenCalled()
    },
  )

  it("surfaces save conflicts without rolling back in-memory work", () => {
    const memory = createMemoryStore()
    memory.store.save = () => ({ status: "conflict" })
    const { result } = renderHook(() =>
      useIngestionWorkflow({ store: memory.store, now: () => FIRST_TIME }),
    )

    act(() => result.current.startReview(parseHl7Message(sampleHl7Message)))

    expect(result.current.state).not.toBeNull()
    expect(result.current.storageError).toMatch(/another session/i)
  })

  it("prevents a stale workflow from overwriting a newer shared snapshot", () => {
    const memory = createMemoryStore()
    const firstHook = renderHook(() =>
      useIngestionWorkflow({ store: memory.store, now: () => FIRST_TIME }),
    )
    const secondHook = renderHook(() =>
      useIngestionWorkflow({ store: memory.store, now: () => SECOND_TIME }),
    )
    const parsedMessage = parseHl7Message(sampleHl7Message)

    act(() => firstHook.result.current.startReview(parsedMessage))
    act(() => secondHook.result.current.startReview(parsedMessage))
    const firstField = firstHook.result.current.state?.reviewFields[0]
    const secondField = secondHook.result.current.state?.reviewFields[1]
    if (!firstField || !secondField) {
      throw new Error("Expected two review fields")
    }

    act(() =>
      secondHook.result.current.updateField(
        confirmReviewableField(secondField),
      ),
    )
    const newerSnapshot = memory.getSnapshot()
    const saveCountBeforeConflict = memory.save.mock.calls.length

    act(() =>
      firstHook.result.current.updateField(confirmReviewableField(firstField)),
    )

    expect(firstHook.result.current.storageError).toMatch(/another session/i)
    expect(memory.getSnapshot()).toEqual(newerSnapshot)
    expect(memory.save).toHaveBeenCalledTimes(saveCountBeforeConflict + 1)

    act(() =>
      firstHook.result.current.updateField(
        confirmReviewableField(
          firstHook.result.current.state?.reviewFields[2] ?? firstField,
        ),
      ),
    )

    expect(memory.save).toHaveBeenCalledTimes(saveCountBeforeConflict + 1)
    expect(memory.getSnapshot()).toEqual(newerSnapshot)

    act(() => firstHook.result.current.reloadReview(parsedMessage))

    expect(firstHook.result.current.storageError).toBeNull()
    expect(firstHook.result.current.state?.reviewFields[1]?.reviewStatus).toBe(
      "confirmed",
    )
    expect(memory.save).toHaveBeenCalledTimes(saveCountBeforeConflict + 1)

    const reloadedFirstField = firstHook.result.current.state?.reviewFields[0]
    if (!reloadedFirstField) throw new Error("Expected the first review field")
    act(() =>
      firstHook.result.current.updateField(
        confirmReviewableField(reloadedFirstField),
      ),
    )

    expect(memory.getSnapshot()?.reviewDecisions[0]?.reviewStatus).toBe(
      "confirmed",
    )
    expect(memory.getSnapshot()?.reviewDecisions[1]?.reviewStatus).toBe(
      "confirmed",
    )
  })

  it("reports a failed reset while rebuilding valid in-memory state", () => {
    const memory = createMemoryStore()
    memory.store.reset = () => ({
      status: "unavailable",
      error: new Error("blocked"),
    })
    const parsedMessage = parseHl7Message(sampleHl7Message)
    const { result } = renderHook(() =>
      useIngestionWorkflow({ store: memory.store, now: () => FIRST_TIME }),
    )
    act(() => result.current.startReview(parsedMessage))

    act(() => result.current.reset(parsedMessage))

    expect(result.current.state).not.toBeNull()
    expect(result.current.storageError).not.toBeNull()
  })

  it("reports reset conflicts and blocks later writes until reload", () => {
    const memory = createMemoryStore()
    const parsedMessage = parseHl7Message(sampleHl7Message)
    const { result } = renderHook(() =>
      useIngestionWorkflow({ store: memory.store, now: () => FIRST_TIME }),
    )
    act(() => result.current.startReview(parsedMessage))
    memory.store.reset = () => ({ status: "conflict" })
    memory.save.mockClear()

    act(() => result.current.reset(parsedMessage))
    const field = result.current.state?.reviewFields[0]
    if (!field) throw new Error("Expected a review field")
    act(() => result.current.updateField(confirmReviewableField(field)))

    expect(result.current.storageError).toMatch(/another session/i)
    expect(memory.save).not.toHaveBeenCalled()
  })
})
