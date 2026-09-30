import {
  stableReviewJson,
  type ClientProfile,
  type ReviewableField,
} from "@hl7-data-mapper/contracts"
import { fingerprintMessage } from "./message-fingerprint"

export const REVIEW_ENGINE_REVISION = "review-v1"

export function reviewContext(
  profile: ClientProfile,
  messageFingerprint: string,
) {
  return {
    clientId: profile.clientId,
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    messageFingerprint,
    mappingRevision: fingerprintMessage(
      stableReviewJson({
        hl7Version: profile.hl7Version,
        items: profile.itemSet.items.map((item) => ({
          ...item,
          sources: item.sources.map(({ raw, ...source }) => {
            void raw
            return source
          }),
        })),
      }),
    ),
    engineRevision: REVIEW_ENGINE_REVISION,
  }
}

export function fieldEvidence(
  field: ReviewableField,
  profile?: ClientProfile,
): string {
  const items = new Map(profile?.itemSet.items.map((item) => [item.id, item]))
  const visited = new Set<string>()
  function dependency(id: string): unknown {
    if (visited.has(id)) return id
    visited.add(id)
    const item = items.get(id)
    return item ? { item, dependencies: item.dependsOn.map(dependency) } : null
  }
  return stableReviewJson({
    path: field.normalizedPath,
    value: field.value,
    sources: field.sources,
    primarySource: field.primarySource,
    validation: field.validation,
    transformHistory: field.transformHistory,
    mapping: field.hl7ItemId ? dependency(field.hl7ItemId) : null,
  })
}
