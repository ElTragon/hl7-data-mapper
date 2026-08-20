import {
  createDraftClientProfileVersion,
  decodeAndMigrateDemoBrowserStorageSnapshot,
  DemoBrowserStorageSnapshotSchema,
  resetDemoBrowserStorageSnapshot,
  type ClientProfile,
  type DemoBrowserStorageSnapshot,
  type ReviewableField,
} from "@hl7-data-mapper/contracts"

export const DEMO_STORAGE_KEY = "hl7-data-mapper:demo-storage:v2"
export const LEGACY_DEMO_STORAGE_KEY = "hl7-data-mapper:demo-storage:v1"
export const MAX_DEMO_AUDIT_EVENTS = 250

export type SnapshotLoadResult =
  | { readonly status: "loaded"; readonly snapshot: DemoBrowserStorageSnapshot }
  | { readonly status: "empty" }
  | { readonly status: "invalid" }
  | { readonly status: "unavailable"; readonly error: unknown }

export type SnapshotSaveResult =
  | { readonly status: "saved" }
  | { readonly status: "saved_with_cleanup_warning"; readonly error: unknown }
  | { readonly status: "conflict" }
  | { readonly status: "unavailable"; readonly error: unknown }

export type SnapshotSaveOptions = {
  readonly expectedSnapshot?: DemoBrowserStorageSnapshot | null
}

export interface DemoSnapshotStore {
  load(): SnapshotLoadResult
  save(
    snapshot: DemoBrowserStorageSnapshot,
    options?: SnapshotSaveOptions,
  ): SnapshotSaveResult
  reset(updatedAt: string): SnapshotSaveResult
}

export const browserDemoSnapshotStore: DemoSnapshotStore = {
  load() {
    if (typeof window === "undefined") {
      return {
        status: "unavailable",
        error: new Error("Window is unavailable."),
      }
    }

    let rawSnapshot: string | null

    try {
      rawSnapshot = window.localStorage.getItem(DEMO_STORAGE_KEY)
      if (rawSnapshot === null) {
        rawSnapshot = window.localStorage.getItem(LEGACY_DEMO_STORAGE_KEY)
      }
    } catch (error) {
      return { status: "unavailable", error }
    }

    if (rawSnapshot === null) {
      return { status: "empty" }
    }

    try {
      return {
        status: "loaded",
        snapshot: decodeAndMigrateDemoBrowserStorageSnapshot(
          JSON.parse(rawSnapshot),
        ),
      }
    } catch {
      return { status: "invalid" }
    }
  },
  save(snapshot, options = {}) {
    if (typeof window === "undefined") {
      return {
        status: "unavailable",
        error: new Error("Window is unavailable."),
      }
    }

    try {
      const safeSnapshot = DemoBrowserStorageSnapshotSchema.parse(snapshot)

      if ("expectedSnapshot" in options) {
        const current = browserDemoSnapshotStore.load()
        if (current.status === "unavailable") return current
        if (current.status === "invalid") return { status: "conflict" }

        const currentSnapshot =
          current.status === "loaded" ? current.snapshot : null
        if (
          JSON.stringify(currentSnapshot) !==
          JSON.stringify(options.expectedSnapshot)
        ) {
          return { status: "conflict" }
        }
      }

      window.localStorage.setItem(
        DEMO_STORAGE_KEY,
        JSON.stringify(safeSnapshot),
      )

      try {
        window.localStorage.removeItem(LEGACY_DEMO_STORAGE_KEY)
      } catch (error) {
        return { status: "saved_with_cleanup_warning", error }
      }

      return { status: "saved" }
    } catch (error) {
      return { status: "unavailable", error }
    }
  },
  reset(updatedAt) {
    return browserDemoSnapshotStore.save(
      resetDemoBrowserStorageSnapshot(updatedAt),
    )
  },
}

export function createDemoDraftProfile({
  sourceProfile,
  createdAt,
}: {
  readonly sourceProfile: ClientProfile
  readonly createdAt: string
}): ClientProfile {
  if (sourceProfile.status === "published") {
    return createDraftClientProfileVersion({
      sourceProfile,
      nextProfileVersion: sourceProfile.profileVersion + 1,
      createdAt,
    })
  }

  return {
    ...sourceProfile,
    status: "draft",
    publishedAt: undefined,
    archivedAt: undefined,
    updatedAt: createdAt,
  }
}

export function buildReviewWorkspaceSnapshot({
  previousSnapshot,
  profile,
  reviewFields,
  messageFingerprint,
  updatedAt,
}: {
  readonly previousSnapshot: DemoBrowserStorageSnapshot | null
  readonly profile: ClientProfile
  readonly reviewFields: readonly ReviewableField[]
  readonly messageFingerprint: string
  readonly updatedAt: string
}): DemoBrowserStorageSnapshot {
  const safeProfile = {
    ...profile,
    itemSet: {
      ...profile.itemSet,
      items: profile.itemSet.items.map((item) => ({
        ...item,
        sources: item.sources.map(withoutRawSourceValue),
      })),
    },
  }
  const previousDecisionByFieldId = new Map(
    previousSnapshot?.reviewDecisions.map((decision) => [
      decision.fieldId,
      decision,
    ]) ?? [],
  )
  const previousIntentByFieldId = new Map(
    previousSnapshot?.correctionIntents.map((intent) => [
      intent.fieldId,
      intent,
    ]) ?? [],
  )
  const nextReviewDecisions = reviewFields.map((field) => {
    const previous = previousDecisionByFieldId.get(field.id)
    const reasonCode = field.reasonCode ?? null
    const didChange =
      !previous ||
      previous.normalizedPath !== field.normalizedPath ||
      previous.messageFingerprint !== messageFingerprint ||
      previous.reviewStatus !== field.reviewStatus ||
      (previous.reasonCode ?? null) !== reasonCode

    return {
      fieldId: field.id,
      normalizedPath: field.normalizedPath,
      messageFingerprint,
      reviewStatus: field.reviewStatus,
      reasonCode,
      updatedAt: didChange ? updatedAt : previous.updatedAt,
    }
  })

  return DemoBrowserStorageSnapshotSchema.parse({
    storageVersion: 2,
    mode: "public_demo",
    draftProfiles: [safeProfile],
    reviewDecisions: nextReviewDecisions,
    correctionIntents: reviewFields.flatMap((field) => {
      const intent = field.correctionIntent

      if (!intent) return []

      const previous = previousIntentByFieldId.get(field.id)
      const replacementSourcePath = intent.replacementSource?.path ?? null
      const replacementSource = intent.replacementSource
        ? withoutRawSourceValue(intent.replacementSource)
        : null
      const replacementHl7Item = intent.replacementHl7Item
        ? {
            ...intent.replacementHl7Item,
            sources: intent.replacementHl7Item.sources.map(
              withoutRawSourceValue,
            ),
          }
        : null
      const didChange =
        !previous ||
        previous.targetHl7ItemId !== intent.targetHl7ItemId ||
        (previous.replacementSourcePath ?? null) !== replacementSourcePath ||
        JSON.stringify(previous.replacementSource ?? null) !==
          JSON.stringify(replacementSource) ||
        JSON.stringify(previous.replacementHl7Item ?? null) !==
          JSON.stringify(replacementHl7Item)

      return [
        {
          fieldId: field.id,
          targetHl7ItemId: intent.targetHl7ItemId,
          replacementSourcePath,
          replacementSource,
          replacementHl7Item,
          updatedAt: didChange ? updatedAt : previous.updatedAt,
        },
      ]
    }),
    demoAuditEvents: [
      ...(previousSnapshot?.demoAuditEvents ?? []),
      ...buildReviewDecisionAuditEvents({
        previousSnapshot,
        reviewFields,
        profile,
        updatedAt,
      }),
    ].slice(-MAX_DEMO_AUDIT_EVENTS),
    updatedAt,
  })
}

function buildReviewDecisionAuditEvents({
  previousSnapshot,
  reviewFields,
  profile,
  updatedAt,
}: {
  readonly previousSnapshot: DemoBrowserStorageSnapshot | null
  readonly reviewFields: readonly ReviewableField[]
  readonly profile: ClientProfile
  readonly updatedAt: string
}) {
  if (!previousSnapshot) {
    return []
  }

  const previousByFieldId = new Map(
    previousSnapshot.reviewDecisions.map((decision) => [
      decision.fieldId,
      decision,
    ]),
  )

  return reviewFields.flatMap((field) => {
    const previous = previousByFieldId.get(field.id)
    const nextReasonCode = field.reasonCode ?? null

    if (
      !previous ||
      (previous.reviewStatus === field.reviewStatus &&
        (previous.reasonCode ?? null) === nextReasonCode)
    ) {
      return []
    }

    const eventIdPrefix = `review-${updatedAt}-${field.id}`
    const occurrence = previousSnapshot.demoAuditEvents.filter((event) =>
      event.eventId.startsWith(eventIdPrefix),
    ).length

    return [
      {
        eventId: `${eventIdPrefix}-${occurrence}`,
        eventType: "review_decision_changed" as const,
        actorType: "demo_user" as const,
        clientId: profile.clientId,
        profileId: profile.profileId,
        profileVersion: profile.profileVersion,
        metadata: {
          fieldId: field.id,
          normalizedPath: field.normalizedPath,
          previousStatus: previous.reviewStatus,
          nextStatus: field.reviewStatus,
          reasonCode: nextReasonCode,
          noteChanged: Boolean(field.reviewNote),
        },
        createdAt: updatedAt,
      },
    ]
  })
}

function withoutRawSourceValue<T extends { readonly raw?: unknown }>(
  source: T,
): Omit<T, "raw"> {
  const { raw, ...safeSource } = source
  void raw
  return safeSource
}
