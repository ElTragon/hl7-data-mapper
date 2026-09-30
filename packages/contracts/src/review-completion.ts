import type { ReviewDecisionReason } from "./review-decision.js"
import type { ReviewStatus } from "./review-status.js"
import type { ValidationIssue, ValidationSummary } from "./validation.js"

export type ReviewSubject = {
  readonly value: unknown
  readonly section: string
  readonly reviewStatus: ReviewStatus
  readonly reasonCode?: ReviewDecisionReason | null
  readonly validation: readonly ValidationIssue[]
}

export function hasReviewValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.some(hasReviewValue)
  if (typeof value === "object")
    return Object.values(value).some(hasReviewValue)
  return true
}

export function isReviewResolved(field: ReviewSubject): boolean {
  if (field.validation.some((issue) => issue.severity === "error")) return false
  if (field.section === "exceptions") {
    if (
      field.validation.length > 0 &&
      field.validation.every((issue) => issue.severity === "info")
    )
      return true
    return field.reviewStatus === "confirmed"
  }
  if (field.reviewStatus === "confirmed") return true
  return (
    field.reviewStatus === "unavailable" &&
    !hasReviewValue(field.value) &&
    (field.reasonCode === "source_not_populated" ||
      field.reasonCode === "not_applicable")
  )
}

export function assessReviewCompletion(
  fields: readonly ReviewSubject[],
  validation?: ValidationSummary,
) {
  const unresolvedCount = fields.filter(
    (field) => !isReviewResolved(field),
  ).length
  const errorCount =
    validation?.errors.length ??
    fields.filter((field) =>
      field.validation.some((issue) => issue.severity === "error"),
    ).length
  return {
    status:
      unresolvedCount === 0 && errorCount === 0
        ? ("completed" as const)
        : ("interim" as const),
    totalCount: fields.length,
    unresolvedCount,
    resolvedCount: fields.length - unresolvedCount,
    errorCount,
    warningCount: validation?.warnings.length ?? 0,
    infoCount: validation?.info.length ?? 0,
  }
}

// Stable serialization excludes object insertion order, but preserves array order.
export function stableReviewJson(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(canonical)
    if (input && typeof input === "object")
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, canonical(v)]),
      )
    return input
  }
  return JSON.stringify(canonical(value))
}
