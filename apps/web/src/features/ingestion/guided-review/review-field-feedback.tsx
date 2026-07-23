import {
  REVIEW_DECISION_REASON_LABELS,
  REVIEW_STATUS_LABELS,
  type ReviewableField,
  type ValidationSeverity,
} from "@hl7-data-mapper/contracts"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import {
  getEffectiveReviewStatus,
  getHighestSeverity,
  hasReviewExplanation,
} from "./review-workspace-model"

const SEVERITY_LABELS: Record<ValidationSeverity, string> = {
  error: "Critical",
  warning: "Review",
  info: "Safe to ignore",
}

const SEVERITY_HELP_TEXT: Record<ValidationSeverity, string> = {
  error:
    "Critical: this blocks a trustworthy mapping result until it is fixed or marked unavailable.",
  warning:
    "Review: this may be a client-specific mapping issue and should be checked before handoff.",
  info: "Safe to ignore: this source slot is blank or absent in the sample, but the collected value can still be valid.",
}

export function ReviewStatusBadge({
  field,
}: {
  readonly field: ReviewableField
}) {
  const reviewStatus = getEffectiveReviewStatus(field)
  const variant =
    reviewStatus === "confirmed" || reviewStatus === "mapping_changed"
      ? "secondary"
      : reviewStatus === "incorrect"
        ? "destructive"
        : "outline"

  return <Badge variant={variant}>{REVIEW_STATUS_LABELS[reviewStatus]}</Badge>
}

export function SeverityBadge({ field }: { readonly field: ReviewableField }) {
  const severity = getHighestSeverity(field)

  if (!severity) {
    return null
  }

  return (
    <Badge variant={severity === "error" ? "destructive" : "outline"}>
      {SEVERITY_LABELS[severity]}
    </Badge>
  )
}

export function SeverityHelp({ field }: { readonly field: ReviewableField }) {
  const severity = getHighestSeverity(field)

  if (!severity) {
    return null
  }

  return (
    <p
      className={cn(
        "mt-2 text-xs leading-5",
        severity === "error"
          ? "text-destructive"
          : severity === "warning"
            ? "text-amber-700"
            : "text-muted-foreground",
      )}
    >
      {SEVERITY_HELP_TEXT[severity]}
    </p>
  )
}

export function ReviewExplanation({
  field,
}: {
  readonly field: ReviewableField
}) {
  if (!hasReviewExplanation(field)) {
    return null
  }

  return (
    <div className="mt-2 flex flex-col gap-1 text-xs">
      {field.reasonCode ? (
        <p>
          <span className="font-medium">Reason:</span>{" "}
          {REVIEW_DECISION_REASON_LABELS[field.reasonCode]}
        </p>
      ) : null}
      {field.reviewNote ? (
        <p className="break-words text-muted-foreground">
          <span className="font-medium text-foreground">Note:</span>{" "}
          {field.reviewNote}
        </p>
      ) : null}
    </div>
  )
}
