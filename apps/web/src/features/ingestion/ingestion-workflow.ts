import {
  normalizedPathKind,
  stableReviewJson,
} from "@hl7-data-mapper/contracts"
import { fieldEvidence, reviewContext } from "./review-evidence"
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
  readSource,
  selectAlternateSourceForReviewableField,
  selectCompositeSourceForReviewableField,
  selectMultipleSourcesForReviewableField,
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
      (candidate) =>
        candidate.clientId === sourceProfile.clientId &&
        candidate.profileId === sourceProfile.profileId &&
        (sourceProfile.status === "published"
          ? candidate.basedOnProfileVersion === sourceProfile.profileVersion
          : candidate.profileVersion === sourceProfile.profileVersion),
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
  const current = state.reviewFields.find(
    (field) => field.id === updatedField.id,
  )
  if (
    !current ||
    fieldEvidence(current, state.profile) !==
      fieldEvidence(updatedField, state.profile)
  )
    return state
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
  const current = state.reviewFields.find(
    (candidate) => candidate.id === field.id,
  )
  if (
    !current ||
    fieldEvidence(current, state.profile) !==
      fieldEvidence(field, state.profile)
  )
    return state
  if (
    Array.isArray(field.value) ||
    normalizedPathKind(field.normalizedPath) === "array"
  )
    return state
  if (
    field.normalizedPath.includes("[") &&
    normalizedPathKind(field.normalizedPath) !== "string"
  )
    return state
  const read = readSource(state.parsedMessage, source)
  if (read.status !== "found" || !read.value?.trim() || !field.hl7ItemId)
    return state
  if (
    (sourceRole || field.id.includes(":")) &&
    [
      state.parsedMessage.delimiters.component,
      state.parsedMessage.delimiters.subcomponent,
      state.parsedMessage.delimiters.repetition,
    ].some((delimiter) => read.value!.includes(delimiter))
  )
    return state
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
  return applyCorrectedReviewField({ state, field, correctedField, occurredAt })
}

export function applyMultipleSourceCorrection({
  state,
  field,
  sources,
  joinSeparator,
  occurredAt,
}: {
  readonly state: ReviewWorkflowState
  readonly field: ReviewableField
  readonly sources: readonly SourceReference[]
  readonly joinSeparator: string
  readonly occurredAt: string
}): ReviewWorkflowState {
  const currentField = state.reviewFields.find(
    (candidateField) => candidateField.id === field.id,
  )
  if (
    !currentField ||
    fieldEvidence(currentField, state.profile) !==
      fieldEvidence(field, state.profile) ||
    !field.hl7ItemId ||
    sources.length < 2 ||
    Array.isArray(field.value) ||
    normalizedPathKind(field.normalizedPath) !== "string" ||
    field.normalizedPath.includes("[")
  ) {
    return state
  }
  const targetMappingItem = state.profile.itemSet.items.find(
    (mappingItem) => mappingItem.id === field.hl7ItemId,
  )
  if (
    targetMappingItem?.valueType !== "string" ||
    (targetMappingItem.action !== "extract" &&
      targetMappingItem.action !== "join") ||
    targetMappingItem.transform
  ) {
    return state
  }

  const everySourceHasValue = sources.every((source) => {
    const sourceRead = readSource(state.parsedMessage, source)
    return sourceRead.status === "found" && Boolean(sourceRead.value?.trim())
  })
  if (!everySourceHasValue) return state

  const replacementSources = sources.map((source) => ({
    ...source,
    raw: undefined,
  }))
  const correctedField = selectMultipleSourcesForReviewableField({
    profile: state.profile,
    field,
    replacementSources,
    joinSeparator,
    notes: `Join ${replacementSources.map((source) => source.path).join(", ")} for ${field.normalizedPath}.`,
  })

  return applyCorrectedReviewField({ state, field, correctedField, occurredAt })
}

function applyCorrectedReviewField({
  state,
  field,
  correctedField,
  occurredAt,
}: {
  readonly state: ReviewWorkflowState
  readonly field: ReviewableField
  readonly correctedField: ReviewableField
  readonly occurredAt: string
}): ReviewWorkflowState {
  const result = applyReviewCorrectionAndRerunMapping({
    parsedMessage: state.parsedMessage,
    profile: state.profile,
    field: correctedField,
    updatedAt: occurredAt,
  })
  const correctedFieldId =
    result.reviewFields.find(
      (candidate) =>
        candidate.section !== "exceptions" &&
        candidate.hl7ItemId === result.correctedItemId &&
        candidate.normalizedPath === field.normalizedPath,
    )?.id ?? field.id
  const correctionIntent =
    correctedField.correctionIntent && result.correctedItemId
      ? {
          ...correctedField.correctionIntent,
          targetHl7ItemId: result.correctedItemId,
        }
      : correctedField.correctionIntent

  return {
    ...state,
    profile: result.profile,
    mappingResult: result.mappingResult,
    reviewFields: mergeReviewFields({
      previousFields: state.reviewFields,
      previousProfile: state.profile,
      nextProfile: result.profile,
      nextFields: result.reviewFields,
      overrideFieldId: correctedFieldId,
      overrideStatus: "mapping_changed",
      correctionIntent: correctionIntent ?? null,
    }),
    selectedFieldId: correctedFieldId,
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
  if (!storedSnapshot || !profile || !storedSnapshot.reviewContext)
    return fields

  const currentContext = reviewContext(profile, messageFingerprint)
  const storedContext = storedSnapshot.reviewContext
  const sameMapping =
    stableReviewJson({
      ...storedContext,
      engineRevision: currentContext.engineRevision,
    }) === stableReviewJson(currentContext)
  if (!sameMapping) return fields

  const sameReviewEngine =
    storedContext.engineRevision === currentContext.engineRevision
  if (!sameReviewEngine)
    return fields.map((field) => ({
      ...field,
      appliedCorrection: restoreCorrectionIntent({
        field,
        profile,
        storedSnapshot,
        applied: true,
      }),
    }))

  const decisionByFieldId = new Map(
    storedSnapshot.reviewDecisions.map((decision) => [
      decision.fieldId,
      decision,
    ]),
  )

  return fields.map((field) => {
    const legacyId = legacyCorrectionReviewId(field, profile)
    const decision =
      decisionByFieldId.get(field.id) ??
      (legacyId ? decisionByFieldId.get(legacyId) : undefined)
    const appliedCorrection = restoreCorrectionIntent({
      field,
      profile,
      storedSnapshot,
      applied: true,
    })

    if (
      !decision ||
      decision.messageFingerprint !== messageFingerprint ||
      decision.normalizedPath !== field.normalizedPath ||
      (decision.reviewStatus === "unavailable" && hasCollectedFieldValue(field))
    ) {
      return { ...field, appliedCorrection }
    }

    return {
      ...field,
      reviewStatus: decision.reviewStatus,
      reasonCode: decision.reasonCode ?? null,
      reviewNote: null,
      appliedCorrection,
      correctionIntent: profile
        ? restoreCorrectionIntent({ field, profile, storedSnapshot })
        : field.correctionIntent,
    }
  })
}

function legacyCorrectionReviewId(
  field: ReviewableField,
  profile: ClientProfile,
) {
  const item = profile.itemSet.items.find((item) => item.id === field.hl7ItemId)
  return item?.recordCorrectionIdentity &&
    item.targetPath === field.normalizedPath &&
    field.id === `${item.id}:replayed:${field.normalizedPath}`
    ? item.id
    : null
}

function restoreCorrectionIntent({
  field,
  profile,
  storedSnapshot,
  applied = false,
}: {
  readonly applied?: boolean
  readonly field: ReviewableField
  readonly profile: ClientProfile
  readonly storedSnapshot: DemoBrowserStorageSnapshot
}): ReviewCorrectionIntent | null {
  const intents = applied
    ? storedSnapshot.appliedCorrections
    : storedSnapshot.correctionIntents
  const legacyId = legacyCorrectionReviewId(field, profile)
  const storedIntent =
    intents.find((intent) => intent.fieldId === field.id) ??
    intents.find(
      (intent) =>
        legacyId !== null &&
        intent.fieldId === legacyId &&
        intent.targetHl7ItemId === field.hl7ItemId,
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
    notes: null,
  }
}

export function mergeReviewFields({
  previousFields,
  nextFields,
  previousProfile,
  nextProfile,
  overrideFieldId,
  overrideStatus,
  correctionIntent,
}: {
  readonly previousProfile?: ClientProfile
  readonly nextProfile?: ClientProfile
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
        appliedCorrection: correctionIntent,
        reasonCode: previousFieldById.get(field.id)?.reasonCode ?? null,
        reviewNote: previousFieldById.get(field.id)?.reviewNote ?? null,
      }
    }

    const previousField = previousFieldById.get(field.id)
    if (
      !previousField ||
      previousField.reviewStatus === "unreviewed" ||
      fieldEvidence(previousField, previousProfile) !==
        fieldEvidence(field, nextProfile) ||
      (previousField.reviewStatus === "unavailable" &&
        hasCollectedFieldValue(field))
    ) {
      return {
        ...field,
        appliedCorrection: previousField?.appliedCorrection ?? null,
      }
    }

    return {
      ...field,
      appliedCorrection: previousField.appliedCorrection,
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
