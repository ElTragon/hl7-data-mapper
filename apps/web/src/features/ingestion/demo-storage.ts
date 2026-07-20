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
  if (typeof window === "undefined") {
    return null
  }

  const rawSnapshot = window.localStorage.getItem(DEMO_STORAGE_KEY)

  if (!rawSnapshot) {
    return null
  }

  try {
    return DemoBrowserStorageSnapshotSchema.parse(JSON.parse(rawSnapshot))
  } catch {
    return null
  }
}

export function saveDemoSnapshot(snapshot: DemoBrowserStorageSnapshot): void {
  if (typeof window === "undefined") {
    return
  }

  const safeSnapshot = DemoBrowserStorageSnapshotSchema.parse(snapshot)
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(safeSnapshot))
}

export function saveReviewWorkspaceSnapshot({
  profile,
  reviewFields,
  updatedAt,
}: {
  readonly profile: ClientProfile
  readonly reviewFields: readonly ReviewableField[]
  readonly updatedAt: string
}): void {
  const previousSnapshot = loadDemoSnapshot()
  const nextReviewDecisions = reviewFields.map((field) => ({
    fieldId: field.id,
    normalizedPath: field.normalizedPath,
    reviewStatus: field.reviewStatus,
    reasonCode: field.reasonCode ?? null,
    reviewNote: field.reviewNote ?? null,
    updatedAt,
  }))

  saveDemoSnapshot({
    storageVersion: 1,
    mode: "public_demo",
    draftProfiles: [profile],
    reviewDecisions: nextReviewDecisions,
    correctionIntents: reviewFields.flatMap((field) => {
      const intent = field.correctionIntent

      if (!intent) {
        return []
      }

      return [
        {
          fieldId: field.id,
          targetHl7ItemId: intent.targetHl7ItemId,
          replacementSourcePath: intent.replacementSource?.path ?? null,
          notes: intent.notes ?? null,
          updatedAt,
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
  saveDemoSnapshot(resetDemoBrowserStorageSnapshot(updatedAt))
}

export function createEmptyStoredDemoSnapshot(
  updatedAt: string,
): DemoBrowserStorageSnapshot {
  return createEmptyDemoBrowserStorageSnapshot(updatedAt)
}
