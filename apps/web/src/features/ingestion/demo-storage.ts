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
  saveDemoSnapshot({
    storageVersion: 1,
    mode: "public_demo",
    draftProfiles: [profile],
    reviewDecisions: reviewFields.map((field) => ({
      fieldId: field.id,
      normalizedPath: field.normalizedPath,
      reviewStatus: field.reviewStatus,
      updatedAt,
    })),
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
    demoAuditEvents: [],
    updatedAt,
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
