import {
  createDraftClientProfileVersion,
  createEmptyDemoBrowserStorageSnapshot,
  DemoBrowserStorageSnapshotSchema,
  resetDemoBrowserStorageSnapshot,
  type ClientProfile,
  type DemoBrowserStorageSnapshot,
  type ReviewableField,
} from "@hl7-data-mapper/contracts"

const DEMO_STORAGE_KEY = "hl7-data-mapper:demo-storage:v1"

export type SnapshotLoadResult =
  | { readonly status: "loaded"; readonly snapshot: DemoBrowserStorageSnapshot }
  | { readonly status: "empty" }
  | { readonly status: "invalid" }
  | { readonly status: "unavailable"; readonly error: unknown }

export type SnapshotSaveResult =
  | { readonly status: "saved" }
  | { readonly status: "conflict" }
  | { readonly status: "unavailable"; readonly error: unknown }

export type SnapshotSaveOptions = {
  readonly expectedUpdatedAt?: string | null
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
    } catch (error) {
      return { status: "unavailable", error }
    }

    if (!rawSnapshot) {
      return { status: "empty" }
    }

    try {
      return {
        status: "loaded",
        snapshot: DemoBrowserStorageSnapshotSchema.parse(
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

      if ("expectedUpdatedAt" in options) {
        const current = browserDemoSnapshotStore.load()
        if (current.status === "unavailable") return current
        if (current.status === "invalid") return { status: "conflict" }

        const currentUpdatedAt =
          current.status === "loaded" ? current.snapshot.updatedAt : null
        if (currentUpdatedAt !== options.expectedUpdatedAt) {
          return { status: "conflict" }
        }
      }

      window.localStorage.setItem(
        DEMO_STORAGE_KEY,
        JSON.stringify(safeSnapshot),
      )
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

export function loadDemoSnapshot(): DemoBrowserStorageSnapshot | null {
  const result = browserDemoSnapshotStore.load()
  return result.status === "loaded" ? result.snapshot : null
}

export function saveDemoSnapshot(snapshot: DemoBrowserStorageSnapshot): void {
  browserDemoSnapshotStore.save(snapshot)
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
    const reviewNote = field.reviewNote ?? null
    const didChange =
      !previous ||
      previous.normalizedPath !== field.normalizedPath ||
      previous.messageFingerprint !== messageFingerprint ||
      previous.reviewStatus !== field.reviewStatus ||
      (previous.reasonCode ?? null) !== reasonCode ||
      (previous.reviewNote ?? null) !== reviewNote

    return {
      fieldId: field.id,
      normalizedPath: field.normalizedPath,
      messageFingerprint,
      reviewStatus: field.reviewStatus,
      reasonCode,
      reviewNote,
      updatedAt: didChange ? updatedAt : previous.updatedAt,
    }
  })

  return DemoBrowserStorageSnapshotSchema.parse({
    storageVersion: 1,
    mode: "public_demo",
    draftProfiles: [profile],
    reviewDecisions: nextReviewDecisions,
    correctionIntents: reviewFields.flatMap((field) => {
      const intent = field.correctionIntent

      if (!intent) return []

      const previous = previousIntentByFieldId.get(field.id)
      const replacementSourcePath = intent.replacementSource?.path ?? null
      const replacementSource = intent.replacementSource
        ? { ...intent.replacementSource, raw: undefined }
        : null
      const replacementHl7Item = intent.replacementHl7Item
        ? {
            ...intent.replacementHl7Item,
            sources: intent.replacementHl7Item.sources.map((source) => ({
              ...source,
              raw: undefined,
            })),
          }
        : null
      const notes = intent.notes ?? null
      const didChange =
        !previous ||
        previous.targetHl7ItemId !== intent.targetHl7ItemId ||
        (previous.replacementSourcePath ?? null) !== replacementSourcePath ||
        JSON.stringify(previous.replacementSource ?? null) !==
          JSON.stringify(replacementSource) ||
        JSON.stringify(previous.replacementHl7Item ?? null) !==
          JSON.stringify(replacementHl7Item) ||
        (previous.notes ?? null) !== notes

      return [
        {
          fieldId: field.id,
          targetHl7ItemId: intent.targetHl7ItemId,
          replacementSourcePath,
          replacementSource,
          replacementHl7Item,
          notes,
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
    ],
    updatedAt,
  })
}

export function saveReviewWorkspaceSnapshot({
  profile,
  reviewFields,
  messageFingerprint,
  updatedAt,
}: {
  readonly profile: ClientProfile
  readonly reviewFields: readonly ReviewableField[]
  readonly messageFingerprint: string
  readonly updatedAt: string
}): void {
  const previousSnapshot = loadDemoSnapshot()

  saveDemoSnapshot(
    buildReviewWorkspaceSnapshot({
      previousSnapshot,
      profile,
      reviewFields,
      messageFingerprint,
      updatedAt,
    }),
  )
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
    const nextReviewNote = field.reviewNote ?? null

    if (
      !previous ||
      (previous.reviewStatus === field.reviewStatus &&
        (previous.reasonCode ?? null) === nextReasonCode &&
        (previous.reviewNote ?? null) === nextReviewNote)
    ) {
      return []
    }

    return [
      {
        eventId: `review-${updatedAt}-${field.id}`,
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
          noteChanged: (previous.reviewNote ?? null) !== nextReviewNote,
        },
        createdAt: updatedAt,
      },
    ]
  })
}

export function getStoredDraftProfile(
  sourceProfile: ClientProfile,
): ClientProfile | null {
  const snapshot = loadDemoSnapshot()

  return (
    snapshot?.draftProfiles.find(
      (profile) => profile.profileId === sourceProfile.profileId,
    ) ?? null
  )
}

export function resetStoredDemoSnapshot(updatedAt: string): void {
  browserDemoSnapshotStore.reset(updatedAt)
}

export function createEmptyStoredDemoSnapshot(
  updatedAt: string,
): DemoBrowserStorageSnapshot {
  return createEmptyDemoBrowserStorageSnapshot(updatedAt)
}
