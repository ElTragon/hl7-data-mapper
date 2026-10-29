import type { ClientProfile, ReviewableField } from "@hl7-data-mapper/contracts"

import type { MappingExecutionResult } from "../execute-mapping.js"
import { recordFields } from "./record-fields.js"
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
  const itemById = new Map(profile.itemSet.items.map((item) => [item.id, item]))
  const normalizedReviewFields = mappingResult.normalizedFields.map(
    (field, index) => {
      const trace = mappingResult.executionTrace[index]
      const item = trace ? itemById.get(trace.itemId) : undefined
      const section = item?.section ?? sectionFromPath(field.key)

      return {
        id:
          item?.targetPath !== field.key
            ? `${item?.id ?? field.key}:replayed:${field.key}`
            : (item?.id ?? field.key),
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
    },
  )

  const explicitPaths = new Set(
    normalizedReviewFields.map((field) => field.normalizedPath),
  )
  const expanded = normalizedReviewFields.flatMap((field, index) =>
    recordFields(
      field,
      mappingResult.executionTrace[index]?.recordSources,
    ).filter(
      (child) =>
        child.id === field.id || !explicitPaths.has(child.normalizedPath),
    ),
  )
  return [...expanded, ...buildWarningReviewFields(mappingResult)]
}
