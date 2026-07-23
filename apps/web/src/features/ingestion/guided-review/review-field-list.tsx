import { Fragment, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  MessageSquareText,
  ShieldCheck,
  XCircle,
} from "lucide-react"

import {
  REVIEW_DECISION_REASON_LABELS,
  REVIEW_DECISION_REASONS,
  REVIEW_STATUS_LABELS,
  type ReviewDecisionReason,
  type ReviewableField,
} from "@hl7-data-mapper/contracts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { CollectedValue } from "./collected-value"
import {
  ReviewExplanation,
  ReviewStatusBadge,
  SeverityBadge,
  SeverityHelp,
} from "./review-field-feedback"
import type {
  EditableReviewStatus,
  ReviewDecisionDetails,
  ReviewDecisionEditorState,
} from "./review-types"
import {
  hasCollectedValue,
  hasReviewExplanation,
  isEditableReviewStatus,
} from "./review-workspace-model"

type ReviewFieldListProps = {
  readonly fields: readonly ReviewableField[]
  readonly decisionEditor: ReviewDecisionEditorState | null
  readonly selectedFieldId: string | null
  readonly onSelectedFieldChange: (fieldId: string) => void
  readonly onConfirmField: (field: ReviewableField) => void
  readonly onEditDecision: (
    field: ReviewableField,
    status: EditableReviewStatus,
  ) => void
  readonly onCloseDecisionEditor: () => void
  readonly onSaveDecision: (
    field: ReviewableField,
    status: EditableReviewStatus,
    details: ReviewDecisionDetails,
  ) => void
}

export function ReviewFieldList({
  fields,
  decisionEditor,
  selectedFieldId,
  onSelectedFieldChange,
  onConfirmField,
  onEditDecision,
  onCloseDecisionEditor,
  onSaveDecision,
}: ReviewFieldListProps) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Fields to review</CardTitle>
        <CardDescription>
          Values remain linked to the `hl7Item` that produced them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {fields.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No fields are available for this section yet.
          </div>
        ) : null}

        {fields.map((field) => (
          <Fragment key={field.id}>
            <ReviewFieldCard
              field={field}
              selectedFieldId={selectedFieldId}
              onSelectedFieldChange={onSelectedFieldChange}
              onConfirmField={onConfirmField}
              onEditDecision={onEditDecision}
            />
            {decisionEditor?.fieldId === field.id ? (
              <ReviewDecisionEditor
                key={`${field.id}-${decisionEditor.status}`}
                field={field}
                status={decisionEditor.status}
                onClose={onCloseDecisionEditor}
                onSave={(details) =>
                  onSaveDecision(field, decisionEditor.status, details)
                }
              />
            ) : null}
          </Fragment>
        ))}
      </CardContent>
    </Card>
  )
}

function ReviewFieldCard({
  field,
  selectedFieldId,
  onSelectedFieldChange,
  onConfirmField,
  onEditDecision,
}: {
  readonly field: ReviewableField
  readonly selectedFieldId: string | null
  readonly onSelectedFieldChange: (fieldId: string) => void
  readonly onConfirmField: (field: ReviewableField) => void
  readonly onEditDecision: (
    field: ReviewableField,
    status: EditableReviewStatus,
  ) => void
}) {
  const unavailableDisabled = hasCollectedValue(field)
  const editableStatus = isEditableReviewStatus(field.reviewStatus)
    ? field.reviewStatus
    : null

  return (
    <article
      data-review-field-card
      className={cn(
        "w-full rounded-lg border p-3 transition hover:border-teal-300",
        field.id === selectedFieldId
          ? "border-teal-500 bg-teal-50/70"
          : "bg-background",
      )}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            aria-label={`Select ${field.label}`}
            className="flex flex-wrap items-center gap-2 text-left"
            onClick={() => onSelectedFieldChange(field.id)}
          >
            <span className="font-medium">{field.label}</span>
            <ReviewStatusBadge field={field} />
            <SeverityBadge field={field} />
          </button>
          <SeverityHelp field={field} />
          <div className="mt-2">
            <CollectedValue value={field.value} density="compact" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{field.normalizedPath}</span>
            <span>{field.primarySource?.path ?? "No source"}</span>
            <span>{field.hl7ItemId ?? "No hl7Item"}</span>
          </div>
          {field.warnings.length > 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              {field.warnings.join(" ")}
            </p>
          ) : null}
          <ReviewExplanation field={field} />
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onConfirmField(field)}
          >
            <CheckCircle2 data-icon="inline-start" />
            Confirm
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onEditDecision(field, "incorrect")}
          >
            <AlertCircle data-icon="inline-start" />
            Incorrect
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={unavailableDisabled}
            title={
              unavailableDisabled
                ? "Use Incorrect when a value was extracted but should be changed."
                : undefined
            }
            onClick={() => onEditDecision(field, "unavailable")}
          >
            <XCircle data-icon="inline-start" />
            Unavailable
          </Button>
          {editableStatus ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onEditDecision(field, editableStatus)}
            >
              <MessageSquareText data-icon="inline-start" />
              {hasReviewExplanation(field)
                ? "Edit explanation"
                : "Add explanation"}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function ReviewDecisionEditor({
  field,
  status,
  onClose,
  onSave,
}: {
  readonly field: ReviewableField
  readonly status: EditableReviewStatus
  readonly onClose: () => void
  readonly onSave: (details: ReviewDecisionDetails) => void
}) {
  const [reasonCode, setReasonCode] = useState<ReviewDecisionReason | "none">(
    field.reasonCode ?? "none",
  )
  const [reviewNote, setReviewNote] = useState(field.reviewNote ?? "")
  const actionLabel =
    status === "mapping_changed" ? "Save explanation" : "Save decision"
  const title =
    status === "mapping_changed"
      ? `Edit explanation for ${field.label}`
      : `Mark ${field.label} ${REVIEW_STATUS_LABELS[status].toLowerCase()}`

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4"
      aria-label={`${title} review decision`}
      onSubmit={(event) => {
        event.preventDefault()
        onSave({
          reasonCode: reasonCode === "none" ? null : reasonCode,
          reviewNote: reviewNote.trim() || null,
        })
      }}
    >
      <div className="flex flex-col gap-1">
        <h4 className="font-medium">{title}</h4>
        <p className="text-sm text-muted-foreground">
          Record why this field needs attention so the decision remains
          understandable during client onboarding and in the handoff report.
        </p>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`review-reason-${field.id}`}>Reason</FieldLabel>
          <Select
            value={reasonCode}
            onValueChange={(value) =>
              setReasonCode(value as ReviewDecisionReason | "none")
            }
          >
            <SelectTrigger id={`review-reason-${field.id}`} className="w-full">
              <SelectValue placeholder="Select a reason" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">No structured reason</SelectItem>
                {REVIEW_DECISION_REASONS.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {REVIEW_DECISION_REASON_LABELS[reason]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            A consistent reason makes onboarding reports easier to scan.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor={`review-note-${field.id}`}>
            Review note
          </FieldLabel>
          <Textarea
            id={`review-note-${field.id}`}
            value={reviewNote}
            maxLength={1000}
            rows={5}
            placeholder="Example: This client does not send patient suffixes, so the field can remain blank."
            onChange={(event) => setReviewNote(event.target.value)}
          />
          <FieldDescription>
            Optional, {reviewNote.length}/1000 characters
          </FieldDescription>
        </Field>
      </FieldGroup>

      <Alert>
        <ShieldCheck />
        <AlertTitle>Keep the note operational</AlertTitle>
        <AlertDescription>
          Explain the client mapping or source-data issue. Do not enter patient
          information. The hosted demo accepts synthetic data only.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{actionLabel}</Button>
      </div>
    </form>
  )
}
