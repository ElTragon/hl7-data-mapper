import { useState } from "react"
import {
  AlertCircle,
  Download,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react"

import {
  type ClientProfile,
  type GuidedReviewStepId,
  type ReviewableField,
  type SourceReference,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"
import type {
  MappingExecutionResult,
  PersonNameSourceRole,
} from "@hl7-data-mapper/mapping-engine"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

import { ReviewFieldInspector } from "./review-field-inspector"
import { ReviewFieldList } from "./review-field-list"
import { ReviewStepRail } from "./review-step-rail"
import type {
  EditableReviewStatus,
  ReviewDecisionDetails,
  ReviewDecisionEditorState,
} from "./review-types"
import {
  buildReviewWorkspaceSummary,
  getActiveReviewFields,
  resolveSelectedReviewField,
} from "./review-workspace-model"

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
  const [decisionEditor, setDecisionEditor] =
    useState<ReviewDecisionEditorState | null>(null)
  const activeFields = getActiveReviewFields(reviewFields, activeStepId)
  const selectedField = resolveSelectedReviewField({
    activeFields,
    selectedFieldId,
  })
  const summary = buildReviewWorkspaceSummary(reviewFields)

  function openDecisionEditor(
    field: ReviewableField,
    status: EditableReviewStatus,
  ) {
    onSelectedFieldChange(field.id)
    setDecisionEditor({ fieldId: field.id, status })
  }

  return (
    <div className="flex flex-col gap-5">
      <WorkspaceHeader
        profile={profile}
        reportStatus={reportStatus}
        onDownloadReport={onDownloadReport}
        onResetDemo={() => {
          setDecisionEditor(null)
          onResetDemo()
        }}
      />

      {summary.unresolvedCount > 0 ? (
        <Alert>
          <AlertCircle />
          <AlertTitle>
            {summary.unresolvedCount} unresolved review decision
            {summary.unresolvedCount === 1 ? "" : "s"}
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
            if (decisionEditor?.fieldId !== fieldId) {
              setDecisionEditor(null)
            }
            onSelectedFieldChange(fieldId)
          }}
          onConfirmField={(field) => {
            setDecisionEditor(null)
            onConfirmField(field)
          }}
          onEditDecision={openDecisionEditor}
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
          onApplySource={(field, source, sourceRole) => {
            setDecisionEditor(null)
            onApplySource(field, source, sourceRole)
          }}
          onEditDecision={openDecisionEditor}
        />
      </div>

      <ReviewSummaryCards
        reviewPercent={summary.reviewPercent}
        fieldCount={reviewFields.length}
        mappingChangeCount={summary.mappingChangeCount}
      />
    </div>
  )
}

function WorkspaceHeader({
  profile,
  reportStatus,
  onDownloadReport,
  onResetDemo,
}: {
  readonly profile: ClientProfile
  readonly reportStatus: GuidedReviewWorkspaceProps["reportStatus"]
  readonly onDownloadReport: () => void
  readonly onResetDemo: () => void
}) {
  return (
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
  )
}

function ReviewSummaryCards({
  reviewPercent,
  fieldCount,
  mappingChangeCount,
}: {
  readonly reviewPercent: number
  readonly fieldCount: number
  readonly mappingChangeCount: number
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Review progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm">
            <span>{reviewPercent}% complete</span>
            <span className="text-muted-foreground">{fieldCount} fields</span>
          </div>
          <Progress className="mt-3" value={reviewPercent} />
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
  )
}
