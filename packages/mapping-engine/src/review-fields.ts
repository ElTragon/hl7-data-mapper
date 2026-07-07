import type {
  ClientProfile,
  Hl7Item,
  NormalizedOutputSection,
  ReviewableField,
} from "@hl7-data-mapper/contracts"

import type {
  MappingExecutionResult,
  MappingExecutionTraceEntry,
} from "./execute-mapping.js"

export type BuildReviewableFieldsInput = {
  readonly mappingResult: MappingExecutionResult
  readonly profile: ClientProfile
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

  return mappingResult.normalizedFields.map((field) => {
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
