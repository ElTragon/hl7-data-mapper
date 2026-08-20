import {
  type ClientProfile,
  type DemoBrowserStorageSnapshot,
  type GuidedReviewStepId,
  type ReviewCorrectionIntent,
  type ReviewableField,
  type SourceReference,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"
import {
  applyReviewCorrectionAndRerunMapping,
  buildReviewableFields,
  executeMapping,
  selectAlternateSourceForReviewableField,
  selectCompositeSourceForReviewableField,
  type MappingExecutionResult,
  type PersonNameSourceRole,
} from "@hl7-data-mapper/mapping-engine"

import { createDemoDraftProfile } from "./demo-storage"
import { fingerprintMessage } from "./message-fingerprint"
import { hasMeaningfulValue } from "./review-value"

export const DEFAULT_REVIEW_STEP: GuidedReviewStepId = "patient"

export type ReviewWorkflowState = {
  readonly parsedMessage: ParsedHl7Message
  readonly profile: ClientProfile
  readonly mappingResult: MappingExecutionResult
  readonly reviewFields: readonly ReviewableField[]
  readonly messageFingerprint: string
  readonly activeStepId: GuidedReviewStepId
  readonly selectedFieldId: string | null
}

export function createReviewWorkflow({
  parsedMessage,
  sourceProfile,
  storedSnapshot,
  occurredAt,
}: {
  readonly parsedMessage: ParsedHl7Message
  readonly sourceProfile: ClientProfile
  readonly storedSnapshot: DemoBrowserStorageSnapshot | null
  readonly occurredAt: string
}): ReviewWorkflowState {
  const profile =
    storedSnapshot?.draftProfiles.find(
      (candidate) => candidate.profileId === sourceProfile.profileId,
    ) ?? createDemoDraftProfile({ sourceProfile, createdAt: occurredAt })
  const mappingResult = executeMapping({ parsedMessage, profile })
  const messageFingerprint = fingerprintMessage(parsedMessage.normalizedText)
  const reviewFields = restoreStoredReviewDecisions({
    fields: buildReviewableFields({ mappingResult, profile }),
    messageFingerprint,
    storedSnapshot,
    profile,
  })

  return {
    parsedMessage,
    profile,
    mappingResult,
    reviewFields,
    messageFingerprint,
    activeStepId: DEFAULT_REVIEW_STEP,
    selectedFieldId: selectInitialField(reviewFields, DEFAULT_REVIEW_STEP),
  }
}

export function updateReviewedField(
  state: ReviewWorkflowState,
  updatedField: ReviewableField,
): ReviewWorkflowState {
  return {
    ...state,
    reviewFields: state.reviewFields.map((field) =>
      field.id === updatedField.id ? updatedField : field,
    ),
    selectedFieldId: updatedField.id,
  }
}

export function changeReviewStep(
  state: ReviewWorkflowState,
  activeStepId: GuidedReviewStepId,
): ReviewWorkflowState {
  return {
    ...state,
    activeStepId,
    selectedFieldId:
      state.reviewFields.find((field) => field.stepId === activeStepId)?.id ??
      null,
  }
}

export function applySourceCorrection({
  state,
  field,
  source,
  sourceRole,
  occurredAt,
}: {
  readonly state: ReviewWorkflowState
  readonly field: ReviewableField
  readonly source: SourceReference
  readonly sourceRole?: PersonNameSourceRole
  readonly occurredAt: string
}): ReviewWorkflowState {
  const replacementSource = { ...source, raw: undefined }
  const correctedField = sourceRole
    ? selectCompositeSourceForReviewableField({
        profile: state.profile,
        field,
        replacementSource,
        sourceRole,
        rawSegment: source.raw,
        notes: `Use ${replacementSource.path} as ${sourceRole} for ${field.normalizedPath}.`,
      })
    : selectAlternateSourceForReviewableField({
        field,
        replacementSource,
        rawSegment: source.raw,
        notes: `Use ${replacementSource.path} for ${field.normalizedPath}.`,
      })
  const result = applyReviewCorrectionAndRerunMapping({
    parsedMessage: state.parsedMessage,
    profile: state.profile,
    field: correctedField,
    updatedAt: occurredAt,
  })

  return {
    ...state,
    profile: result.profile,
    mappingResult: result.mappingResult,
    reviewFields: mergeReviewFields({
      previousFields: state.reviewFields,
      nextFields: result.reviewFields,
      overrideFieldId: field.id,
      overrideStatus: "mapping_changed",
      correctionIntent: correctedField.correctionIntent ?? null,
    }),
    selectedFieldId: field.id,
  }
}

export function restoreStoredReviewDecisions({
  fields,
  messageFingerprint,
  storedSnapshot,
  profile,
}: {
  readonly fields: readonly ReviewableField[]
  readonly messageFingerprint: string
  readonly storedSnapshot: DemoBrowserStorageSnapshot | null
  readonly profile?: ClientProfile
}): readonly ReviewableField[] {
  if (!storedSnapshot) return fields

  const decisionByFieldId = new Map(
    storedSnapshot.reviewDecisions.map((decision) => [
      decision.fieldId,
      decision,
    ]),
  )

  return fields.map((field) => {
    const decision = decisionByFieldId.get(field.id)

    if (
      !decision ||
      decision.messageFingerprint !== messageFingerprint ||
      decision.normalizedPath !== field.normalizedPath ||
      (decision.reviewStatus === "unavailable" && hasCollectedFieldValue(field))
    ) {
      return field
    }

    return {
      ...field,
      reviewStatus: decision.reviewStatus,
      reasonCode: decision.reasonCode ?? null,
      reviewNote: decision.reviewNote ?? null,
      correctionIntent: profile
        ? restoreCorrectionIntent({ field, profile, storedSnapshot })
        : field.correctionIntent,
    }
  })
}

function restoreCorrectionIntent({
  field,
  profile,
  storedSnapshot,
}: {
  readonly field: ReviewableField
  readonly profile: ClientProfile
  readonly storedSnapshot: DemoBrowserStorageSnapshot
}): ReviewCorrectionIntent | null {
  const storedIntent = storedSnapshot.correctionIntents.find(
    (intent) => intent.fieldId === field.id,
  )
  if (!storedIntent) return null

  const targetItem = profile.itemSet.items.find(
    (item) => item.id === storedIntent.targetHl7ItemId,
  )
  if (!targetItem) return null

  const replacementSource =
    storedIntent.replacementSource ??
    (storedIntent.replacementSourcePath
      ? (targetItem.sources.find(
          (source) => source.path === storedIntent.replacementSourcePath,
        ) ?? null)
      : null)

  if (storedIntent.replacementSourcePath && !replacementSource) return null

  return {
    targetHl7ItemId: storedIntent.targetHl7ItemId,
    replacementSource,
    replacementHl7Item:
      storedIntent.replacementHl7Item ??
      (replacementSource && targetItem.transform?.name === "mapXpnName"
        ? targetItem
        : undefined),
    notes: storedIntent.notes ?? null,
  }
}

export function mergeReviewFields({
  previousFields,
  nextFields,
  overrideFieldId,
  overrideStatus,
  correctionIntent,
}: {
  readonly previousFields: readonly ReviewableField[]
  readonly nextFields: readonly ReviewableField[]
  readonly overrideFieldId: string
  readonly overrideStatus: ReviewableField["reviewStatus"]
  readonly correctionIntent: ReviewableField["correctionIntent"] | null
}): readonly ReviewableField[] {
  const previousFieldById = new Map(
    previousFields.map((field) => [field.id, field]),
  )

  return nextFields.map((field) => {
    if (field.id === overrideFieldId) {
      if (overrideStatus === "unavailable" && hasCollectedFieldValue(field)) {
        return field
      }

      return {
        ...field,
        reviewStatus: overrideStatus,
        correctionIntent,
        reasonCode: previousFieldById.get(field.id)?.reasonCode ?? null,
        reviewNote: previousFieldById.get(field.id)?.reviewNote ?? null,
      }
    }

    const previousField = previousFieldById.get(field.id)
    if (
      !previousField ||
      previousField.reviewStatus === "unreviewed" ||
      (previousField.reviewStatus === "unavailable" &&
        hasCollectedFieldValue(field))
    ) {
      return field
    }

    return {
      ...field,
      reviewStatus: previousField.reviewStatus,
      correctionIntent: previousField.correctionIntent,
      reasonCode: previousField.reasonCode ?? null,
      reviewNote: previousField.reviewNote ?? null,
    }
  })
}

function selectInitialField(
  fields: readonly ReviewableField[],
  stepId: GuidedReviewStepId,
): string | null {
  return (
    fields.find((field) => field.stepId === stepId)?.id ?? fields[0]?.id ?? null
  )
}

function hasCollectedFieldValue(field: ReviewableField): boolean {
  return field.section !== "exceptions" && hasMeaningfulValue(field.value)
}
