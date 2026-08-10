import type { ClientProfile, ReviewableField } from "@hl7-data-mapper/contracts"

import type { MappingExecutionResult } from "../execute-mapping.js"
import { buildWarningReviewFields } from "./warning-review-fields.js"
import {
  firstRawSegment,
  sectionFromPath,
  sourceCandidateReason,
  stepIdFromSection,
} from "./review-field-metadata.js"

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
