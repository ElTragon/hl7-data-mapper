import { Fragment, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  Download,
  FileSearch,
  MessageSquareText,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from "lucide-react"

import {
  createSourceReference,
  REVIEW_DECISION_REASON_LABELS,
  REVIEW_DECISION_REASONS,
  REVIEW_STATUS_LABELS,
  type ClientProfile,
  type GuidedReviewStepId,
  type ReviewDecisionReason,
  type ReviewableField,
  type SourceExpectation,
  type SourceReference,
  type ValidationSeverity,
} from "@hl7-data-mapper/contracts"
import type {
  Hl7Component,
  Hl7Field,
  Hl7Repetition,
  Hl7Segment,
  ParsedHl7Message,
} from "@hl7-data-mapper/hl7-parser"
import {
  buildGuidedReviewNavigation,
  readSourceValue,
  type MappingExecutionResult,
  type PersonNameSourceRole,
} from "@hl7-data-mapper/mapping-engine"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

type EditableReviewStatus = "incorrect" | "mapping_changed" | "unavailable"

type ReviewDecisionDetails = {
  readonly reasonCode: ReviewDecisionReason | null
  readonly reviewNote: string | null
}

type GuidedReviewWorkspaceProps = {
  readonly parsedMessage: ParsedHl7Message
  readonly profile: ClientProfile
  readonly mappingResult: MappingExecutionResult
  readonly reviewFields: readonly ReviewableField[]
  readonly activeStepId: GuidedReviewStepId
  readonly selectedFieldId: string | null
  readonly reportStatus: "idle" | "generating" | "downloaded"
  readonly onActiveStepChange: (stepId: GuidedReviewStepId) => void
  readonly onSelectedFieldChange: (fieldId: string) => void
  readonly onConfirmField: (field: ReviewableField) => void
  readonly onSaveReviewDecision: (
    field: ReviewableField,
    status: EditableReviewStatus,
    details: ReviewDecisionDetails,
  ) => void
  readonly onApplySource: (
    field: ReviewableField,
    source: SourceReference,
    sourceRole?: PersonNameSourceRole,
  ) => void
  readonly onDownloadReport: () => void
  readonly onResetDemo: () => void
}

export function GuidedReviewWorkspace({
  parsedMessage,
  profile,
  mappingResult,
  reviewFields,
  activeStepId,
  selectedFieldId,
  reportStatus,
  onActiveStepChange,
  onSelectedFieldChange,
  onConfirmField,
  onSaveReviewDecision,
  onApplySource,
  onDownloadReport,
  onResetDemo,
}: GuidedReviewWorkspaceProps) {
  const [decisionEditor, setDecisionEditor] = useState<{
    readonly field: ReviewableField
    readonly status: EditableReviewStatus
  } | null>(null)
  const activeFields = reviewFields.filter(
    (field) => field.stepId === activeStepId,
  )
  const selectedField =
    reviewFields.find((field) => field.id === selectedFieldId) ??
    activeFields[0] ??
    reviewFields[0] ??
    null
  const reviewProgress = getReviewPercent(reviewFields)
  const mappingChangeCount = reviewFields.filter(
    (field) => field.reviewStatus === "mapping_changed",
  ).length
  const unresolvedCount = reviewFields.filter(
    (field) =>
      field.reviewStatus === "unreviewed" || field.reviewStatus === "incorrect",
  ).length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-lg border bg-background p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Guided review</Badge>
            <Badge variant="outline">{profile.clientId}</Badge>
            <Badge variant="outline">Draft v{profile.profileVersion}</Badge>
          </div>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight">
            Review mappings with source evidence.
          </h3>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Confirm extracted values, inspect raw HL7 provenance, and update the
            draft client mapping when a value comes from a different field.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onResetDemo}>
            <RotateCcw data-icon="inline-start" />
            Reset demo draft
          </Button>
          <Button
            onClick={onDownloadReport}
            disabled={reportStatus === "generating"}
          >
            <Download data-icon="inline-start" />
            {reportStatus === "generating" ? "Building..." : "Download report"}
          </Button>
        </div>
      </div>

      {unresolvedCount > 0 ? (
        <Alert>
          <AlertCircle />
          <AlertTitle>
            {unresolvedCount} unresolved review decision
            {unresolvedCount === 1 ? "" : "s"}
          </AlertTitle>
          <AlertDescription>
            You can still export the report. Open and incorrect fields will be
            documented as outstanding onboarding work.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_360px]">
        <ReviewStepRail
          activeStepId={activeStepId}
          fields={reviewFields}
          onActiveStepChange={(stepId) => {
            setDecisionEditor(null)
            onActiveStepChange(stepId)
          }}
        />

        <ReviewFieldList
          fields={activeFields}
          decisionEditor={decisionEditor}
          selectedFieldId={selectedField?.id ?? null}
          onSelectedFieldChange={(fieldId) => {
            if (decisionEditor?.field.id !== fieldId) {
              setDecisionEditor(null)
            }
            onSelectedFieldChange(fieldId)
          }}
          onConfirmField={(field) => {
            setDecisionEditor(null)
            onConfirmField(field)
          }}
          onEditDecision={(field, status) => {
            onSelectedFieldChange(field.id)
            setDecisionEditor({ field, status })
          }}
          onCloseDecisionEditor={() => setDecisionEditor(null)}
          onSaveDecision={(field, status, details) => {
            onSaveReviewDecision(field, status, details)
            setDecisionEditor(null)
          }}
        />

        <ReviewFieldInspector
          parsedMessage={parsedMessage}
          field={selectedField}
          mappingResult={mappingResult}
          onApplySource={onApplySource}
          onEditDecision={(field, status) =>
            setDecisionEditor({ field, status })
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Review progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm">
              <span>{reviewProgress}% complete</span>
              <span className="text-muted-foreground">
                {reviewFields.length} fields
              </span>
            </div>
            <Progress className="mt-3" value={reviewProgress} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Mapping changes</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <SlidersHorizontal className="size-5 text-teal-700" />
            <span className="text-2xl font-semibold">{mappingChangeCount}</span>
            <span className="text-sm text-muted-foreground">draft updates</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Report policy</CardTitle>
          </CardHeader>
          <CardContent className="flex items-start gap-3 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-5 text-teal-700" />
            <span>Raw HL7 is excluded from the default public-demo ZIP.</span>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ReviewStepRail({
  activeStepId,
  fields,
  onActiveStepChange,
}: {
  readonly activeStepId: GuidedReviewStepId
  readonly fields: readonly ReviewableField[]
  readonly onActiveStepChange: (stepId: GuidedReviewStepId) => void
}) {
  const navigation = buildGuidedReviewNavigation({
    fields,
    activeStepId,
  })

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">Review sections</CardTitle>
        <CardDescription>Walk through each mapping area.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {navigation.steps.map((step) => {
          const percent = getStepPercent(step.progress)

          return (
            <button
              key={step.id}
              type="button"
              className={[
                "rounded-lg border p-3 text-left transition hover:border-teal-300",
                step.id === activeStepId
                  ? "border-teal-500 bg-teal-50/70"
                  : "bg-background",
              ].join(" ")}
              onClick={() => onActiveStepChange(step.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{step.title}</span>
                {step.isComplete ? (
                  <CheckCircle2 className="size-4 text-teal-700" />
                ) : step.hasBlockingIssues ? (
                  <AlertCircle className="size-4 text-destructive" />
                ) : (
                  <CircleDot className="size-4 text-muted-foreground" />
                )}
              </div>
              <Progress className="mt-3" value={percent} />
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{step.progress.confirmed} confirmed</span>
                <span>{step.progress.unreviewed} open</span>
                <span>{step.progress.mappingChanged} changed</span>
                <span>{step.progress.unavailable} unavailable</span>
              </div>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}

function ReviewFieldList({
  fields,
  decisionEditor,
  selectedFieldId,
  onSelectedFieldChange,
  onConfirmField,
  onEditDecision,
  onCloseDecisionEditor,
  onSaveDecision,
}: {
  readonly fields: readonly ReviewableField[]
  readonly decisionEditor: {
    readonly field: ReviewableField
    readonly status: EditableReviewStatus
  } | null
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
}) {
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
            {decisionEditor?.field.id === field.id ? (
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
    <div
      role="button"
      tabIndex={0}
      aria-label={`Select ${field.label}`}
      className={[
        "w-full rounded-lg border p-3 text-left transition hover:border-teal-300",
        field.id === selectedFieldId
          ? "border-teal-500 bg-teal-50/70"
          : "bg-background",
      ].join(" ")}
      onClick={() => onSelectedFieldChange(field.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelectedFieldChange(field.id)
        }
      }}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{field.label}</span>
            <ReviewStatusBadge field={field} />
            <SeverityBadge field={field} />
          </div>
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
            onClick={(event) => {
              event.stopPropagation()
              onConfirmField(field)
            }}
          >
            <CheckCircle2 data-icon="inline-start" />
            Confirm
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation()
              onEditDecision(field, "incorrect")
            }}
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
            onClick={(event) => {
              event.stopPropagation()
              onEditDecision(field, "unavailable")
            }}
          >
            <XCircle data-icon="inline-start" />
            Unavailable
          </Button>
          {hasReviewExplanation(field) && editableStatus ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation()
                onEditDecision(field, editableStatus)
              }}
            >
              <MessageSquareText data-icon="inline-start" />
              Edit note
            </Button>
          ) : null}
        </div>
      </div>
    </div>
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

function ReviewExplanation({ field }: { readonly field: ReviewableField }) {
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

function ReviewFieldInspector({
  parsedMessage,
  field,
  mappingResult,
  onApplySource,
  onEditDecision,
}: {
  readonly parsedMessage: ParsedHl7Message
  readonly field: ReviewableField | null
  readonly mappingResult: MappingExecutionResult
  readonly onApplySource: (
    field: ReviewableField,
    source: SourceReference,
    sourceRole?: PersonNameSourceRole,
  ) => void
  readonly onEditDecision: (
    field: ReviewableField,
    status: EditableReviewStatus,
  ) => void
}) {
  if (!field) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Source inspector</CardTitle>
          <CardDescription>Select a field to inspect evidence.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const trace = mappingResult.executionTrace.find(
    (entry) => entry.itemId === field.hl7ItemId,
  )
  const editableStatus = isEditableReviewStatus(field.reviewStatus)
    ? field.reviewStatus
    : null

  return (
    <Card className="h-fit min-w-0">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Source inspector</CardTitle>
            <CardDescription>{field.label}</CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <SeverityBadge field={field} />
            <ReviewStatusBadge field={field} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SeverityHelp field={field} />

        {hasReviewExplanation(field) ? (
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Review explanation</p>
              {editableStatus ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onEditDecision(field, editableStatus)}
                >
                  <MessageSquareText data-icon="inline-start" />
                  Edit
                </Button>
              ) : null}
            </div>
            <ReviewExplanation field={field} />
          </div>
        ) : null}

        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Extracted value
          </p>
          <div className="mt-2">
            <CollectedValue value={field.value} density="comfortable" />
          </div>
        </div>

        <div className="grid gap-2 text-sm">
          <EvidenceRow label="Normalized path" value={field.normalizedPath} />
          <EvidenceRow
            label="Primary source"
            value={field.primarySource?.path ?? "Unavailable"}
          />
          <EvidenceRow label="hl7Item" value={field.hl7ItemId ?? "None"} />
          <EvidenceRow
            label="Transform"
            value={
              field.transformHistory.length > 0
                ? field.transformHistory.map((step) => step.name).join(", ")
                : "None"
            }
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Raw segment
          </p>
          <pre className="max-h-36 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
            {field.rawSegment ?? "No raw segment available."}
          </pre>
        </div>

        {trace?.sourceReads.length ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Current source reads
            </p>
            <div className="flex flex-col gap-2">
              {trace.sourceReads.map((sourceRead) => (
                <SourceReadEvidence
                  key={`${sourceRead.source.path}-${sourceRead.status}`}
                  expectation={findSourceExpectation(
                    trace.sourceExpectations,
                    sourceRead.source.path,
                  )}
                  sourcePath={sourceRead.source.path}
                  status={sourceRead.status}
                  value={sourceRead.value}
                />
              ))}
            </div>
          </div>
        ) : null}

        <Separator />

        <div>
          <div className="mb-3 flex items-center gap-2">
            <FileSearch className="size-4 text-teal-700" />
            <p className="text-sm font-medium">Choose another HL7 source</p>
          </div>
          <Hl7SourceBrowser
            parsedMessage={parsedMessage}
            field={field}
            onApplySource={onApplySource}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function Hl7SourceBrowser({
  parsedMessage,
  field,
  onApplySource,
}: {
  readonly parsedMessage: ParsedHl7Message
  readonly field: ReviewableField
  readonly onApplySource: (
    field: ReviewableField,
    source: SourceReference,
    sourceRole?: PersonNameSourceRole,
  ) => void
}) {
  const options = buildSourceOptions(parsedMessage)
  const isPersonNameField = isPersonNameReviewField(field)

  return (
    <div className="max-h-[520px] overflow-auto rounded-lg border">
      {options.map((option) => (
        <div
          key={`${option.segment.index}-${option.path}`}
          data-source-option={option.path}
          className="border-b p-3 last:border-b-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{option.path}</span>
                <Badge variant="outline">
                  {option.segment.name} #{option.segment.index + 1}
                </Badge>
              </div>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {option.previewValue || "Empty value"}
              </p>
            </div>
            {isPersonNameField ? (
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {PERSON_NAME_SOURCE_ROLES.map((sourceRole) => (
                  <Button
                    key={sourceRole}
                    type="button"
                    size="sm"
                    variant={
                      isCurrentSourceForRole(field, option.source)
                        ? "secondary"
                        : "outline"
                    }
                    disabled={!field.hl7ItemId}
                    onClick={() =>
                      onApplySource(field, option.source, sourceRole)
                    }
                  >
                    {PERSON_NAME_SOURCE_LABELS[sourceRole]}
                  </Button>
                ))}
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant={
                  field.primarySource?.path === option.path
                    ? "secondary"
                    : "outline"
                }
                disabled={!field.hl7ItemId}
                onClick={() => onApplySource(field, option.source)}
              >
                Use source
              </Button>
            )}
          </div>
          <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
            {option.segment.raw}
          </p>
        </div>
      ))}
    </div>
  )
}

function SourceReadEvidence({
  expectation,
  sourcePath,
  status,
  value,
}: {
  readonly expectation: SourceExpectation | null
  readonly sourcePath: string
  readonly status: string
  readonly value: string | null
}) {
  return (
    <div className="rounded-md border p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono">{sourcePath}</span>
        <div className="flex flex-wrap justify-end gap-1">
          {expectation ? (
            <Badge variant="outline">
              {EXPECTATION_REQUIREDNESS_LABELS[expectation.requiredness]}
            </Badge>
          ) : null}
          <Badge variant="outline">{status}</Badge>
        </div>
      </div>
      {expectation ? (
        <div className="mt-2 space-y-1">
          <p className="font-medium">{expectation.expectedLabel}</p>
          {expectation.examples.length > 0 ? (
            <p className="break-words text-muted-foreground">
              Example: {expectation.examples.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-2 break-words text-muted-foreground">
        Value: {formatValue(value)}
      </p>
      {expectation && (value === null || value === "") ? (
        <p className="mt-2 break-words text-muted-foreground">
          {expectation.emptyMeaning}
          {expectation.guidance ? ` ${expectation.guidance}` : ""}
        </p>
      ) : null}
    </div>
  )
}

const EXPECTATION_REQUIREDNESS_LABELS: Record<
  SourceExpectation["requiredness"],
  string
> = {
  required: "Required",
  recommended: "Recommended",
  optional: "Optional",
  conditional: "Conditional",
}

function findSourceExpectation(
  expectations: readonly SourceExpectation[],
  sourcePath: string,
): SourceExpectation | null {
  return (
    expectations.find((expectation) => expectation.path === sourcePath) ?? null
  )
}

type SourceOption = {
  readonly path: string
  readonly source: SourceReference
  readonly segment: Hl7Segment
  readonly previewValue: string
}

const PERSON_NAME_SOURCE_ROLES: readonly PersonNameSourceRole[] = [
  "family",
  "given",
  "middle",
  "suffix",
  "prefix",
]

const PERSON_NAME_SOURCE_LABELS: Record<PersonNameSourceRole, string> = {
  family: "Family",
  given: "Given",
  middle: "Middle",
  suffix: "Suffix",
  prefix: "Prefix",
}

function isPersonNameReviewField(field: ReviewableField): boolean {
  return (
    field.normalizedPath.endsWith(".name") &&
    field.value !== null &&
    typeof field.value === "object" &&
    ("family" in field.value || "given" in field.value)
  )
}

function isCurrentSourceForRole(
  field: ReviewableField,
  source: SourceReference,
): boolean {
  return field.sources.some(
    (fieldSource) =>
      fieldSource.path === source.path &&
      (fieldSource.segmentIndex ?? null) === (source.segmentIndex ?? null),
  )
}

function buildSourceOptions(parsedMessage: ParsedHl7Message): SourceOption[] {
  return parsedMessage.segments.flatMap((segment) =>
    segment.fields.flatMap((field) =>
      fieldToSourceOptions(parsedMessage, segment, field),
    ),
  )
}

function fieldToSourceOptions(
  parsedMessage: ParsedHl7Message,
  segment: Hl7Segment,
  field: Hl7Field,
): SourceOption[] {
  const options: SourceOption[] = []

  options.push(createSourceOption(parsedMessage, segment, field))

  field.repetitions.forEach((repetition, repetitionIndex) => {
    const sourceRepetitionIndex =
      field.repetitions.length > 1 ? repetitionIndex + 1 : undefined

    repetition.components.forEach((component, componentIndex) => {
      options.push(
        createSourceOption(
          parsedMessage,
          segment,
          field,
          repetition,
          sourceRepetitionIndex,
          component,
          componentIndex + 1,
        ),
      )

      component.subComponents.forEach((_, subComponentIndex) => {
        options.push(
          createSourceOption(
            parsedMessage,
            segment,
            field,
            repetition,
            sourceRepetitionIndex,
            component,
            componentIndex + 1,
            subComponentIndex + 1,
          ),
        )
      })
    })
  })

  return options
}

function createSourceOption(
  parsedMessage: ParsedHl7Message,
  segment: Hl7Segment,
  field: Hl7Field,
  repetition?: Hl7Repetition,
  repetitionIndex?: number,
  component?: Hl7Component,
  componentIndex?: number,
  subComponentIndex?: number,
): SourceOption {
  const source = createSourceReference({
    segment: segment.name,
    field: field.index,
    repetition: repetitionIndex,
    component: componentIndex,
    subComponent: subComponentIndex,
    segmentIndex: segment.index,
    raw: segment.raw,
  })
  const previewValue = readSourceValue(parsedMessage, source)

  return {
    path: source.path,
    source,
    segment,
    previewValue:
      typeof previewValue === "string"
        ? previewValue
        : (component?.value ?? repetition?.value ?? field.raw),
  }
}

function ReviewStatusBadge({ field }: { readonly field: ReviewableField }) {
  const reviewStatus =
    field.reviewStatus === "unavailable" && hasCollectedValue(field)
      ? "unreviewed"
      : field.reviewStatus
  const variant =
    reviewStatus === "confirmed" || reviewStatus === "mapping_changed"
      ? "secondary"
      : reviewStatus === "incorrect"
        ? "destructive"
        : "outline"

  return <Badge variant={variant}>{REVIEW_STATUS_LABELS[reviewStatus]}</Badge>
}

function SeverityBadge({ field }: { readonly field: ReviewableField }) {
  const severity = getHighestSeverity(field)

  if (!severity) {
    return null
  }

  const variant = severity === "error" ? "destructive" : "outline"

  return <Badge variant={variant}>{SEVERITY_LABELS[severity]}</Badge>
}

function SeverityHelp({ field }: { readonly field: ReviewableField }) {
  const severity = getHighestSeverity(field)

  if (!severity) {
    return null
  }

  return (
    <p
      className={[
        "mt-2 text-xs leading-5",
        severity === "error"
          ? "text-destructive"
          : severity === "warning"
            ? "text-amber-700"
            : "text-muted-foreground",
      ].join(" ")}
    >
      {SEVERITY_HELP_TEXT[severity]}
    </p>
  )
}

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

function getHighestSeverity(field: ReviewableField): ValidationSeverity | null {
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

function hasCollectedValue(field: ReviewableField): boolean {
  return field.section !== "exceptions" && hasMeaningfulValue(field.value)
}

function hasReviewExplanation(field: ReviewableField): boolean {
  return Boolean(field.reasonCode || field.reviewNote)
}

function isEditableReviewStatus(
  status: ReviewableField["reviewStatus"],
): status is EditableReviewStatus {
  return (
    status === "incorrect" ||
    status === "mapping_changed" ||
    status === "unavailable"
  )
}

function EvidenceRow({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="break-words font-mono text-xs">{value}</span>
    </div>
  )
}

function getReviewPercent(fields: readonly ReviewableField[]) {
  if (fields.length === 0) {
    return 0
  }

  const complete = fields.filter(
    (field) =>
      field.reviewStatus === "confirmed" ||
      field.reviewStatus === "mapping_changed" ||
      field.reviewStatus === "unavailable",
  ).length

  return Math.round((complete / fields.length) * 100)
}

function getStepPercent(progress: {
  readonly total: number
  readonly confirmed: number
  readonly mappingChanged: number
  readonly unavailable: number
}) {
  if (progress.total === 0) {
    return 0
  }

  return Math.round(
    ((progress.confirmed + progress.mappingChanged + progress.unavailable) /
      progress.total) *
      100,
  )
}

function CollectedValue({
  value,
  density,
}: {
  readonly value: unknown
  readonly density: "compact" | "comfortable"
}) {
  const groups = buildValueGroups(value)

  if (groups.length === 0) {
    return (
      <p className="break-words font-mono text-sm text-muted-foreground">
        Unavailable
      </p>
    )
  }

  if (groups.length === 1 && groups[0]?.rows.length === 1) {
    return (
      <p className="break-words text-sm leading-6 text-foreground">
        {groups[0].rows[0]?.value}
      </p>
    )
  }

  return (
    <div
      className={[
        "grid min-w-0 gap-2",
        density === "compact" ? "text-sm" : "text-sm",
      ].join(" ")}
    >
      {groups.map((group) => (
        <div key={group.title ?? "value"} className="min-w-0">
          {group.title ? (
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {group.title}
            </p>
          ) : null}
          <dl
            className={[
              "grid min-w-0 gap-x-3 gap-y-1",
              density === "compact"
                ? "grid-cols-[92px_minmax(0,1fr)]"
                : "grid-cols-[120px_minmax(0,1fr)]",
            ].join(" ")}
          >
            {group.rows.map((row) => (
              <div
                key={`${group.title ?? "value"}-${row.label}`}
                className="contents"
              >
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere] text-sm leading-5 text-foreground">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

type ValueGroup = {
  readonly title?: string
  readonly rows: readonly ValueRow[]
}

type ValueRow = {
  readonly label: string
  readonly value: string
}

function buildValueGroups(value: unknown): ValueGroup[] {
  if (isEmptyValue(value)) {
    return []
  }

  if (typeof value !== "object") {
    return [
      {
        rows: [{ label: "Value", value: String(value) }],
      },
    ]
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => {
      if (isEmptyValue(entry)) {
        return []
      }

      const rows = valueToRows(entry)

      if (rows.length === 0) {
        return []
      }

      return [
        {
          title: value.length > 1 ? `Record ${index + 1}` : undefined,
          rows,
        },
      ]
    })
  }

  const rows = valueToRows(value)

  return rows.length > 0 ? [{ rows }] : []
}

function valueToRows(value: unknown): ValueRow[] {
  if (isEmptyValue(value)) {
    return []
  }

  if (typeof value !== "object") {
    return [{ label: "Value", value: String(value) }]
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      valueToRows(entry).map((row) => ({
        label: `${index + 1} ${row.label}`,
        value: row.value,
      })),
    )
  }

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, entry]) => {
      if (isEmptyValue(entry)) {
        return []
      }

      if (typeof entry === "object" && !Array.isArray(entry)) {
        return valueToRows(entry).map((row) => ({
          label: `${humanizeKey(key)} ${row.label}`,
          value: row.value,
        }))
      }

      if (Array.isArray(entry)) {
        return entry.flatMap((arrayEntry, index) =>
          valueToRows(arrayEntry).map((row) => ({
            label: `${humanizeKey(key)} ${index + 1} ${row.label}`,
            value: row.value,
          })),
        )
      }

      return [{ label: humanizeKey(key), value: String(entry) }]
    },
  )
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  )
}

function hasMeaningfulValue(value: unknown): boolean {
  if (isEmptyValue(value)) {
    return false
  }

  if (Array.isArray(value)) {
    return value.some((entry) => hasMeaningfulValue(entry))
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((entry) =>
      hasMeaningfulValue(entry),
    )
  }

  return true
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Unavailable"
  }

  if (typeof value === "string") {
    return value
  }

  return JSON.stringify(value)
}
