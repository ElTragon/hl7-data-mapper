import { assessReviewCompletion } from "@hl7-data-mapper/contracts"
import type {
  GuidedReviewStepId,
  ReviewableField,
  ValidationSeverity,
} from "@hl7-data-mapper/contracts"

import type { EditableReviewStatus } from "./review-types"
import { hasMeaningfulValue } from "../review-value"

export type ReviewWorkspaceSummary = {
  readonly reviewPercent: number
  readonly mappingChangeCount: number
  readonly unresolvedCount: number
}

export function getActiveReviewFields(
  fields: readonly ReviewableField[],
  activeStepId: GuidedReviewStepId,
): ReviewableField[] {
  return fields.filter((field) => field.stepId === activeStepId)
}

export function resolveSelectedReviewField({
  activeFields,
  selectedFieldId,
}: {
  readonly activeFields: readonly ReviewableField[]
  readonly selectedFieldId: string | null
}): ReviewableField | null {
  return (
    activeFields.find((field) => field.id === selectedFieldId) ??
    activeFields[0] ??
    null
  )
}

export function buildReviewWorkspaceSummary(
  fields: readonly ReviewableField[],
): ReviewWorkspaceSummary {
  if (fields.length === 0) {
    return {
      reviewPercent: 0,
      mappingChangeCount: 0,
      unresolvedCount: 0,
    }
  }

  const completion = assessReviewCompletion(fields)
  return {
    reviewPercent: Math.round((completion.resolvedCount / fields.length) * 100),
    mappingChangeCount: fields.filter((field) =>
      Boolean(field.appliedCorrection),
    ).length,
    unresolvedCount: completion.unresolvedCount,
  }
}

export function getStepPercent(progress: {
  readonly total: number
  readonly resolvedCount: number
}): number {
  return progress.total === 0
    ? 100
    : Math.round((progress.resolvedCount / progress.total) * 100)
}

export function getEffectiveReviewStatus(
  field: ReviewableField,
): ReviewableField["reviewStatus"] {
  return field.reviewStatus === "unavailable" && hasCollectedValue(field)
    ? "unreviewed"
    : field.reviewStatus
}

export function getHighestSeverity(
  field: ReviewableField,
): ValidationSeverity | null {
  if (field.validation.some((issue) => issue.severity === "error")) {
    return "error"
  }

  if (field.validation.some((issue) => issue.severity === "warning")) {
    return "warning"
  }

  if (field.validation.some((issue) => issue.severity === "info")) {
    return "info"
  }

  return null
}

export function hasCollectedValue(field: ReviewableField): boolean {
  return field.section !== "exceptions" && hasMeaningfulValue(field.value)
}

export function hasReviewExplanation(field: ReviewableField): boolean {
  return Boolean(field.reasonCode || field.reviewNote)
}

export function isEditableReviewStatus(
  status: ReviewableField["reviewStatus"],
): status is EditableReviewStatus {
  return (
    status === "incorrect" ||
    status === "mapping_changed" ||
    status === "unavailable"
  )
}
