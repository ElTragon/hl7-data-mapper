import {
  canEditClientProfile,
  ClientProfileSchema,
  GUIDED_REVIEW_STEPS,
  SourceReferenceSchema,
  type ClientProfile,
  type GuidedReviewProgress,
  type GuidedReviewStepId,
  type Hl7Item,
  type NormalizedOutputSection,
  type ReviewableField,
  type SourceReference,
  type ValidationIssue,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import { executeMapping } from "./execute-mapping.js"
import type {
  MappingExecutionResult,
  MappingExecutionTraceEntry,
} from "./execute-mapping.js"

export type BuildReviewableFieldsInput = {
  readonly mappingResult: MappingExecutionResult
  readonly profile: ClientProfile
}

export type SelectAlternateSourceInput = {
  readonly field: ReviewableField
  readonly replacementSource: SourceReference
  readonly rawSegment?: string | null
  readonly previewValue?: unknown
  readonly reason?: string | null
  readonly notes?: string
}

export type ApplyReviewCorrectionInput = {
  readonly profile: ClientProfile
  readonly field: ReviewableField
  readonly updatedAt: string
}

export type ApplyReviewCorrectionAndRerunInput = ApplyReviewCorrectionInput & {
  readonly parsedMessage: ParsedHl7Message
}

export type ApplyReviewCorrectionAndRerunResult = {
  readonly profile: ClientProfile
  readonly mappingResult: MappingExecutionResult
  readonly reviewFields: readonly ReviewableField[]
}

export type GuidedReviewStepSummary = {
  readonly id: GuidedReviewStepId
  readonly title: string
  readonly progress: GuidedReviewProgress
  readonly isComplete: boolean
  readonly hasBlockingIssues: boolean
}

export type GuidedReviewNavigation = {
  readonly steps: readonly GuidedReviewStepSummary[]
  readonly activeStepId: GuidedReviewStepId
  readonly nextStepId: GuidedReviewStepId | null
}

export type BuildGuidedReviewNavigationInput = {
  readonly fields: readonly ReviewableField[]
  readonly activeStepId?: GuidedReviewStepId
}

export function buildReviewableFields({
  mappingResult,
  profile,
}: BuildReviewableFieldsInput): ReviewableField[] {
  const itemByTargetPath = new Map(
    profile.itemSet.items.map((item) => [item.targetPath, item]),
  )
  const traceByTargetPath = new Map(
    mappingResult.executionTrace.map((entry) => [entry.targetPath, entry]),
  )

  const normalizedReviewFields = mappingResult.normalizedFields.map((field) => {
    const item = itemByTargetPath.get(field.key)
    const trace = traceByTargetPath.get(field.key)
    const section = item?.section ?? sectionFromPath(field.key)

    return {
      id: item?.id ?? field.key,
      stepId: stepIdFromSection(section),
      section,
      normalizedPath: field.key,
      label: field.label,
      value: field.value,
      hl7ItemId: item?.id ?? null,
      primarySource: field.primarySource ?? null,
      sources: [...field.sources],
      rawSegment: firstRawSegment(trace),
      transformHistory: [...field.transformHistory],
      validation: [...field.validation],
      warnings: [...field.warnings],
      reviewStatus: field.reviewStatus,
      sourceCandidates: trace
        ? trace.sourceReads.map((sourceRead) => ({
            source: sourceRead.source,
            rawSegment: sourceRead.rawSegment,
            previewValue: sourceRead.value,
            reason: sourceCandidateReason(item, trace),
          }))
        : [],
    }
  })

  return [...normalizedReviewFields, ...buildWarningReviewFields(mappingResult)]
}

export function confirmReviewableField(
  field: ReviewableField,
): ReviewableField {
  return {
    ...field,
    reviewStatus: "confirmed",
    correctionIntent: null,
  }
}

export function markReviewableFieldIncorrect(
  field: ReviewableField,
  notes?: string,
): ReviewableField {
  return {
    ...field,
    reviewStatus: "incorrect",
    correctionIntent: field.hl7ItemId
      ? {
          targetHl7ItemId: field.hl7ItemId,
          notes: notes ?? null,
        }
      : null,
  }
}

export function markReviewableFieldUnavailable(
  field: ReviewableField,
  notes?: string,
): ReviewableField {
  return {
    ...field,
    reviewStatus: "unavailable",
    correctionIntent: field.hl7ItemId
      ? {
          targetHl7ItemId: field.hl7ItemId,
          replacementSource: null,
          notes: notes ?? null,
        }
      : null,
  }
}

export function selectAlternateSourceForReviewableField({
  field,
  replacementSource,
  rawSegment,
  previewValue,
  reason,
  notes,
}: SelectAlternateSourceInput): ReviewableField {
  if (!field.hl7ItemId) {
    throw new Error(
      `Cannot select an alternate source for "${field.label}" because it is not linked to an hl7Item.`,
    )
  }

  const parsedSource = SourceReferenceSchema.parse(replacementSource)
  const candidateAlreadyExists = field.sourceCandidates.some(
    (candidate) => candidate.source.path === parsedSource.path,
  )

  return {
    ...field,
    reviewStatus: "incorrect",
    sourceCandidates: candidateAlreadyExists
      ? field.sourceCandidates
      : [
          ...field.sourceCandidates,
          {
            source: parsedSource,
            rawSegment: rawSegment ?? parsedSource.raw ?? null,
            previewValue: previewValue ?? null,
            reason: reason ?? "User-selected alternate HL7 source.",
          },
        ],
    correctionIntent: {
      targetHl7ItemId: field.hl7ItemId,
      replacementSource: parsedSource,
      notes: notes ?? null,
    },
  }
}

export function applyReviewFieldCorrectionToProfile({
  profile,
  field,
  updatedAt,
}: ApplyReviewCorrectionInput): ClientProfile {
  const parsedProfile = ClientProfileSchema.parse(profile)

  if (!canEditClientProfile(parsedProfile)) {
    throw new Error(
      `Client profile "${parsedProfile.profileId}" cannot be edited while status is "${parsedProfile.status}".`,
    )
  }

  const targetHl7ItemId =
    field.correctionIntent?.targetHl7ItemId ?? field.hl7ItemId
  const replacementSource = field.correctionIntent?.replacementSource

  if (!targetHl7ItemId) {
    throw new Error(
      `Cannot apply a correction for "${field.label}" because it is not linked to an hl7Item.`,
    )
  }

  if (!replacementSource) {
    throw new Error(
      `Cannot apply a source correction for "${field.label}" because no replacement source was selected.`,
    )
  }

  let didUpdateItem = false
  const updatedItems = parsedProfile.itemSet.items.map((item) => {
    if (item.id !== targetHl7ItemId) {
      return item
    }

    didUpdateItem = true

    return {
      ...item,
      sources: [replacementSource],
      notes: appendNote(
        item.notes,
        field.correctionIntent?.notes ??
          `Updated source from guided review for ${field.normalizedPath}.`,
      ),
    }
  })

  if (!didUpdateItem) {
    throw new Error(
      `Could not find hl7Item "${targetHl7ItemId}" in profile "${parsedProfile.profileId}".`,
    )
  }

  return ClientProfileSchema.parse({
    ...parsedProfile,
    updatedAt,
    itemSet: {
      ...parsedProfile.itemSet,
      items: updatedItems,
    },
  })
}

export function applyReviewCorrectionAndRerunMapping({
  parsedMessage,
  profile,
  field,
  updatedAt,
}: ApplyReviewCorrectionAndRerunInput): ApplyReviewCorrectionAndRerunResult {
  const updatedProfile = applyReviewFieldCorrectionToProfile({
    profile,
    field,
    updatedAt,
  })
  const mappingResult = executeMapping({
    parsedMessage,
    profile: updatedProfile,
  })

  return {
    profile: updatedProfile,
    mappingResult,
    reviewFields: buildReviewableFields({
      mappingResult,
      profile: updatedProfile,
    }),
  }
}

export function buildWarningReviewFields(
  mappingResult: MappingExecutionResult,
): ReviewableField[] {
  return [
    ...mappingResult.validation.errors.map((issue, index) =>
      validationIssueToReviewableField(issue, "error", index),
    ),
    ...mappingResult.validation.warnings.map((issue, index) =>
      validationIssueToReviewableField(issue, "warning", index),
    ),
    ...mappingResult.validation.info.map((issue, index) =>
      validationIssueToReviewableField(issue, "info", index),
    ),
  ]
}

export function calculateGuidedReviewProgress(
  fields: readonly ReviewableField[],
): GuidedReviewProgress {
  return {
    total: fields.length,
    unreviewed: fields.filter((field) => field.reviewStatus === "unreviewed")
      .length,
    confirmed: fields.filter((field) => field.reviewStatus === "confirmed")
      .length,
    incorrect: fields.filter((field) => field.reviewStatus === "incorrect")
      .length,
    mappingChanged: fields.filter(
      (field) => field.reviewStatus === "mapping_changed",
    ).length,
    unavailable: fields.filter((field) => field.reviewStatus === "unavailable")
      .length,
  }
}

export function buildGuidedReviewNavigation({
  fields,
  activeStepId = "patient",
}: BuildGuidedReviewNavigationInput): GuidedReviewNavigation {
  const steps = GUIDED_REVIEW_STEPS.map((step) => {
    const stepFields = fields.filter((field) => field.stepId === step.id)
    const progress = calculateGuidedReviewProgress(stepFields)

    return {
      id: step.id,
      title: step.title,
      progress,
      isComplete:
        progress.total > 0 &&
        progress.unreviewed === 0 &&
        progress.incorrect === 0,
      hasBlockingIssues: stepFields.some((field) =>
        field.validation.some((issue) => issue.severity === "error"),
      ),
    }
  })
  const nextStepId =
    steps.find(
      (step) =>
        step.id !== activeStepId && !step.isComplete && step.progress.total > 0,
    )?.id ?? null

  return {
    steps,
    activeStepId,
    nextStepId,
  }
}

function stepIdFromSection(
  section: NormalizedOutputSection,
): ReviewableField["stepId"] {
  if (section === "coverage" || section === "guarantor") {
    return "coverageGuarantor"
  }

  if (section === "labOrders") {
    return "labOrders"
  }

  if (section === "exceptions") {
    return "warnings"
  }

  return section
}

function sectionFromPath(path: string): NormalizedOutputSection {
  if (path.startsWith("patient.")) {
    return "patient"
  }

  if (path.startsWith("coverages.") || path.startsWith("coverages[")) {
    return "coverage"
  }

  if (path.startsWith("guarantor.") || path === "guarantor") {
    return "guarantor"
  }

  if (path.startsWith("labOrders.") || path.startsWith("labOrders[")) {
    return "labOrders"
  }

  if (path.startsWith("message.") || path.startsWith("sender.")) {
    return "sender"
  }

  return "exceptions"
}

function firstRawSegment(
  trace: MappingExecutionTraceEntry | undefined,
): string | null {
  return (
    trace?.sourceReads.find((sourceRead) => sourceRead.rawSegment)
      ?.rawSegment ?? null
  )
}

function sourceCandidateReason(
  item: Hl7Item | undefined,
  trace: MappingExecutionTraceEntry,
): string {
  if (!item) {
    return `Read while mapping ${trace.targetPath}.`
  }

  return `Source read for "${item.label}".`
}

function appendNote(existingNote: string | null | undefined, nextNote: string) {
  if (!existingNote) {
    return nextNote
  }

  return `${existingNote}\n${nextNote}`
}

function validationIssueToReviewableField(
  issue: ValidationIssue,
  group: "error" | "warning" | "info",
  index: number,
): ReviewableField {
  const normalizedPath =
    issue.fieldKey ?? issue.path ?? `validation.${group}.${index}`
  const source = issue.source ?? null

  return {
    id: `validation-${group}-${index}-${issue.code}`,
    stepId: "warnings",
    section: "exceptions",
    normalizedPath,
    label: validationLabel(issue),
    value: issue.message,
    hl7ItemId: null,
    primarySource: source,
    sources: source ? [source] : [],
    rawSegment: source?.raw ?? null,
    transformHistory: [],
    validation: [issue],
    warnings: issue.severity === "warning" ? [issue.message] : [],
    reviewStatus: "unreviewed",
    sourceCandidates: [],
  }
}

function validationLabel(issue: ValidationIssue): string {
  if (issue.fieldKey) {
    return `Review ${issue.fieldKey}`
  }

  if (issue.segment) {
    return `Review ${issue.segment} issue`
  }

  return "Review mapping issue"
}
