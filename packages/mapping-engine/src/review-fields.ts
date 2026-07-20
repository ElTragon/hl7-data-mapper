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
  type ReviewDecisionReason,
  type ReviewableField,
  type SourceExpectation,
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

export type PersonNameSourceRole =
  "family" | "given" | "middle" | "suffix" | "prefix"

export type SelectCompositeFieldSourceInput = SelectAlternateSourceInput & {
  readonly profile: ClientProfile
  readonly sourceRole: PersonNameSourceRole
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

export type ReviewDecisionDetails = {
  readonly reasonCode?: ReviewDecisionReason | null
  readonly reviewNote?: string | null
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
      reasonCode: null,
      reviewNote: null,
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
  details: ReviewDecisionDetails = {},
): ReviewableField {
  return {
    ...field,
    reviewStatus: "incorrect",
    reasonCode: details.reasonCode ?? null,
    reviewNote: details.reviewNote?.trim() || null,
    correctionIntent: field.hl7ItemId
      ? {
          targetHl7ItemId: field.hl7ItemId,
        }
      : null,
  }
}

export function markReviewableFieldUnavailable(
  field: ReviewableField,
  details: ReviewDecisionDetails = {},
): ReviewableField {
  return {
    ...field,
    reviewStatus: "unavailable",
    reasonCode: details.reasonCode ?? null,
    reviewNote: details.reviewNote?.trim() || null,
    correctionIntent: field.hl7ItemId
      ? {
          targetHl7ItemId: field.hl7ItemId,
          replacementSource: null,
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

export function selectCompositeSourceForReviewableField({
  profile,
  field,
  replacementSource,
  sourceRole,
  rawSegment,
  previewValue,
  reason,
  notes,
}: SelectCompositeFieldSourceInput): ReviewableField {
  if (!field.hl7ItemId) {
    throw new Error(
      `Cannot select a composite source for "${field.label}" because it is not linked to an hl7Item.`,
    )
  }

  const parsedProfile = ClientProfileSchema.parse(profile)
  const targetItem = parsedProfile.itemSet.items.find(
    (item) => item.id === field.hl7ItemId,
  )

  if (!targetItem) {
    throw new Error(
      `Could not find hl7Item "${field.hl7ItemId}" in profile "${parsedProfile.profileId}".`,
    )
  }

  if (targetItem.transform?.name !== "mapXpnName") {
    return selectAlternateSourceForReviewableField({
      field,
      replacementSource,
      rawSegment,
      previewValue,
      reason,
      notes,
    })
  }

  const parsedSource = SourceReferenceSchema.parse(replacementSource)
  const replacementHl7Item = replacePersonNameRoleSource({
    item: targetItem,
    source: parsedSource,
    sourceRole,
    notes,
  })
  const candidateAlreadyExists = field.sourceCandidates.some(
    (candidate) =>
      candidate.source.path === parsedSource.path &&
      (candidate.source.segmentIndex ?? null) ===
        (parsedSource.segmentIndex ?? null),
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
            reason:
              reason ??
              `User-selected ${sourceRole} source for composite person name.`,
          },
        ],
    correctionIntent: {
      targetHl7ItemId: field.hl7ItemId,
      replacementSource: parsedSource,
      replacementHl7Item,
      notes:
        notes ??
        `Use ${parsedSource.path} as ${sourceRole} for ${field.normalizedPath}.`,
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
  const replacementHl7Item = field.correctionIntent?.replacementHl7Item

  if (!targetHl7ItemId) {
    throw new Error(
      `Cannot apply a correction for "${field.label}" because it is not linked to an hl7Item.`,
    )
  }

  if (!replacementSource && !replacementHl7Item) {
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

    if (replacementHl7Item) {
      return {
        ...replacementHl7Item,
        notes: appendNote(
          replacementHl7Item.notes,
          field.correctionIntent?.notes ??
            `Updated composite source from guided review for ${field.normalizedPath}.`,
        ),
      }
    }

    if (!replacementSource) {
      return item
    }

    return {
      ...item,
      sources: [replacementSource],
      sourceExpectations: buildUpdatedSourceExpectations({
        item,
        nextSources: [replacementSource],
      }),
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

const PERSON_NAME_SOURCE_ROLES: readonly PersonNameSourceRole[] = [
  "family",
  "given",
  "middle",
  "suffix",
  "prefix",
]

function replacePersonNameRoleSource({
  item,
  source,
  sourceRole,
  notes,
}: {
  readonly item: Hl7Item
  readonly source: SourceReference
  readonly sourceRole: PersonNameSourceRole
  readonly notes?: string
}): Hl7Item {
  const sourceRoles = buildPersonNameSourceRoles(item)
  const retainedSources = item.sources.filter((existingSource, index) => {
    const existingRole = sourceRoles.get(sourceKey(existingSource))

    return (
      existingRole !== sourceRole &&
      PERSON_NAME_SOURCE_ROLES[index] !== sourceRole
    )
  })
  const nextSources = [...retainedSources, source]
  const sourceRoleByPath = new Map<string, PersonNameSourceRole>(
    retainedSources.map((existingSource, index) => [
      existingSource.path,
      sourceRoles.get(sourceKey(existingSource)) ??
        PERSON_NAME_SOURCE_ROLES[index] ??
        "family",
    ]),
  )
  sourceRoleByPath.set(source.path, sourceRole)
  const nextSourceRoles = [
    ...retainedSources.map((existingSource, index) => ({
      path: existingSource.path,
      segmentIndex: existingSource.segmentIndex ?? null,
      role:
        sourceRoles.get(sourceKey(existingSource)) ??
        PERSON_NAME_SOURCE_ROLES[index] ??
        "family",
    })),
    {
      path: source.path,
      segmentIndex: source.segmentIndex ?? null,
      role: sourceRole,
    },
  ]

  return {
    ...item,
    sources: nextSources,
    sourceExpectations: buildUpdatedSourceExpectations({
      item,
      nextSources,
      createFallbackExpectation: (nextSource) =>
        createPersonNameSourceExpectation(
          nextSource,
          sourceRoleByPath.get(nextSource.path) ?? "family",
        ),
    }),
    transform: {
      name: "mapXpnName",
      description: item.transform?.description,
      params: {
        ...(item.transform?.params ?? {}),
        sourceRoles: nextSourceRoles,
      },
    },
    notes: appendNote(
      item.notes,
      notes ?? `Use ${source.path} as ${sourceRole} for ${item.targetPath}.`,
    ),
  }
}

function buildUpdatedSourceExpectations({
  item,
  nextSources,
  createFallbackExpectation = (source) =>
    createFallbackSourceExpectation(item, source),
}: {
  readonly item: Hl7Item
  readonly nextSources: readonly SourceReference[]
  readonly createFallbackExpectation?: (
    source: SourceReference,
  ) => SourceExpectation
}): SourceExpectation[] {
  return nextSources.map((source) => {
    const existingExpectation = item.sourceExpectations.find(
      (expectation) => expectation.path === source.path,
    )

    return existingExpectation ?? createFallbackExpectation(source)
  })
}

function createFallbackSourceExpectation(
  item: Hl7Item,
  source: SourceReference,
): SourceExpectation {
  return {
    path: source.path,
    expectedLabel: item.label,
    requiredness: item.required ? "required" : "recommended",
    examples: [],
    emptyMeaning: `No value was present at ${source.path}.`,
    guidance: `Review this client-selected source for ${item.targetPath}.`,
  }
}

function createPersonNameSourceExpectation(
  source: SourceReference,
  sourceRole: PersonNameSourceRole,
): SourceExpectation {
  return {
    path: source.path,
    expectedLabel: PERSON_NAME_ROLE_EXPECTATION_LABELS[sourceRole],
    requiredness:
      sourceRole === "family" || sourceRole === "given"
        ? "required"
        : "optional",
    examples: PERSON_NAME_ROLE_EXAMPLES[sourceRole],
    emptyMeaning: `No ${PERSON_NAME_ROLE_EXPECTATION_LABELS[sourceRole].toLowerCase()} was present at ${source.path}.`,
    guidance:
      sourceRole === "family" || sourceRole === "given"
        ? "Review with the client if this is blank; this is usually needed to identify the patient."
        : `Usually safe to ignore unless this client relies on ${PERSON_NAME_ROLE_EXPECTATION_LABELS[sourceRole].toLowerCase()} values.`,
  }
}

const PERSON_NAME_ROLE_EXPECTATION_LABELS: Record<
  PersonNameSourceRole,
  string
> = {
  family: "Patient family name",
  given: "Patient given name",
  middle: "Patient middle name or initial",
  suffix: "Patient name suffix",
  prefix: "Patient name prefix",
}

const PERSON_NAME_ROLE_EXAMPLES: Record<PersonNameSourceRole, string[]> = {
  family: ["Lopez"],
  given: ["Elena"],
  middle: ["M"],
  suffix: ["Jr", "Sr", "III"],
  prefix: ["Dr", "Mr", "Ms"],
}

function buildPersonNameSourceRoles(
  item: Hl7Item,
): ReadonlyMap<string, PersonNameSourceRole> {
  const configuredRoles = item.transform?.params["sourceRoles"]
  const roleBySourceKey = new Map<string, PersonNameSourceRole>()

  if (Array.isArray(configuredRoles)) {
    configuredRoles.forEach((entry) => {
      if (isSourceRoleEntry(entry)) {
        roleBySourceKey.set(
          sourceKey({
            path: entry.path,
            segmentIndex: entry.segmentIndex,
          }),
          entry.role,
        )
      }
    })
  }

  item.sources.forEach((source, index) => {
    if (!roleBySourceKey.has(sourceKey(source))) {
      const role = PERSON_NAME_SOURCE_ROLES[index]

      if (role) {
        roleBySourceKey.set(sourceKey(source), role)
      }
    }
  })

  return roleBySourceKey
}

function isSourceRoleEntry(value: unknown): value is {
  readonly path: string
  readonly segmentIndex?: number | null
  readonly role: PersonNameSourceRole
} {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as {
    readonly path?: unknown
    readonly segmentIndex?: unknown
    readonly role?: unknown
  }

  return (
    typeof candidate.path === "string" &&
    (candidate.segmentIndex === undefined ||
      candidate.segmentIndex === null ||
      typeof candidate.segmentIndex === "number") &&
    PERSON_NAME_SOURCE_ROLES.includes(candidate.role as PersonNameSourceRole)
  )
}

function sourceKey({
  path,
  segmentIndex,
}: {
  readonly path: string
  readonly segmentIndex?: number | null
}): string {
  return `${segmentIndex ?? "first"}:${path}`
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
  const validationFields = [
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
  const validationSourcePaths = new Set(
    validationFields.flatMap((field) =>
      field.sources.map((source) => source.path),
    ),
  )

  return [
    ...validationFields,
    ...mappingResult.executionTrace.flatMap((entry) =>
      entry.sourceReads
        .filter((sourceRead) => sourceRead.status !== "found")
        .filter(
          (sourceRead) => !validationSourcePaths.has(sourceRead.source.path),
        )
        .map((sourceRead, index) =>
          sourceReadToReviewableField(entry, sourceRead, index),
        ),
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

function sourceReadToReviewableField(
  trace: MappingExecutionTraceEntry,
  sourceRead: MappingExecutionTraceEntry["sourceReads"][number],
  index: number,
): ReviewableField {
  const issue = sourceReadIssue(trace, sourceRead)

  return {
    id: `source-read-${trace.itemId}-${index}-${sourceRead.status}`,
    stepId: "warnings",
    section: "exceptions",
    normalizedPath: trace.targetPath,
    label: `Review ${trace.targetPath} source`,
    value: issue.message,
    hl7ItemId: trace.itemId,
    primarySource: sourceRead.source,
    sources: [sourceRead.source],
    rawSegment: sourceRead.rawSegment,
    transformHistory: [],
    validation: [issue],
    warnings: issue.severity === "warning" ? [issue.message] : [],
    reviewStatus: "unreviewed",
    sourceCandidates: [
      {
        source: sourceRead.source,
        rawSegment: sourceRead.rawSegment,
        previewValue: sourceRead.value,
        reason: `Source read status: ${sourceRead.status}.`,
      },
    ],
  }
}

function sourceReadIssue(
  trace: MappingExecutionTraceEntry,
  sourceRead: MappingExecutionTraceEntry["sourceReads"][number],
): ValidationIssue {
  const expectation = findSourceExpectation(trace, sourceRead.source.path)

  return {
    code: `source-read-${sourceRead.status}`,
    severity: sourceReadSeverity(trace, sourceRead, expectation),
    message: sourceReadMessage(trace, sourceRead, expectation),
    fieldKey: trace.targetPath,
    section: "exceptions",
    segment: sourceRead.source.segment,
    source: sourceRead.source,
  }
}

function sourceReadSeverity(
  trace: MappingExecutionTraceEntry,
  sourceRead: MappingExecutionTraceEntry["sourceReads"][number],
  expectation = findSourceExpectation(trace, sourceRead.source.path),
): ValidationIssue["severity"] {
  if (isSafeToIgnoreSource(sourceRead, expectation)) {
    return "info"
  }

  return "warning"
}

function isSafeToIgnoreSource(
  sourceRead: MappingExecutionTraceEntry["sourceReads"][number],
  expectation: SourceExpectation | null,
): boolean {
  if (
    sourceRead.status !== "empty" &&
    sourceRead.status !== "missing_component" &&
    sourceRead.status !== "missing_subcomponent"
  ) {
    return false
  }

  return expectation?.requiredness === "optional"
}

function sourceReadMessage(
  trace: MappingExecutionTraceEntry,
  sourceRead: MappingExecutionTraceEntry["sourceReads"][number],
  expectation: SourceExpectation | null,
): string {
  if (!expectation) {
    return `Source ${sourceRead.source.path} for ${trace.targetPath} returned ${sourceRead.status}.`
  }

  return [
    `Expected ${sentenceCaseLabel(expectation.expectedLabel)} at ${sourceRead.source.path}.`,
    expectation.emptyMeaning ??
      `The source returned ${sourceRead.status.replaceAll("_", " ")}.`,
    expectation.guidance,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ")
}

function sentenceCaseLabel(label: string): string {
  return `${label.slice(0, 1).toLowerCase()}${label.slice(1)}`
}

function findSourceExpectation(
  trace: MappingExecutionTraceEntry,
  sourcePath: string,
): SourceExpectation | null {
  return (
    trace.sourceExpectations?.find(
      (expectation) => expectation.path === sourcePath,
    ) ?? null
  )
}
