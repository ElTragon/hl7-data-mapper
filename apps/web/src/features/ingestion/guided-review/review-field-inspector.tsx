import { FileSearch, MessageSquareText } from "lucide-react"

import {
  type ReviewableField,
  type SourceExpectation,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"
import type {
  MappingExecutionResult,
  MappingExecutionTraceEntry,
} from "@hl7-data-mapper/mapping-engine"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

import { Hl7SourceBrowser } from "../hl7-source-browser"
import { CollectedValue } from "./collected-value"
import {
  ReviewExplanation,
  ReviewStatusBadge,
  SeverityBadge,
  SeverityHelp,
} from "./review-field-feedback"
import type { ApplyReviewSource, EditableReviewStatus } from "./review-types"
import {
  hasReviewExplanation,
  isEditableReviewStatus,
} from "./review-workspace-model"

type ReviewFieldInspectorProps = {
  readonly parsedMessage: ParsedHl7Message
  readonly field: ReviewableField | null
  readonly mappingResult: MappingExecutionResult
  readonly onApplySource: ApplyReviewSource
  readonly onEditDecision: (
    field: ReviewableField,
    status: EditableReviewStatus,
  ) => void
}

export function ReviewFieldInspector({
  parsedMessage,
  field,
  mappingResult,
  onApplySource,
  onEditDecision,
}: ReviewFieldInspectorProps) {
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
              {trace.sourceReads.map((sourceRead, index) => (
                <SourceReadEvidence
                  key={`${sourceRead.source.segmentIndex ?? "first"}-${sourceRead.source.path}-${sourceRead.status}-${index}`}
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
            key={`${field.id}:${parsedMessage.normalizedText}`}
            parsedMessage={parsedMessage}
            field={field}
            onApplySource={onApplySource}
          />
        </div>
      </CardContent>
    </Card>
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
  readonly status: MappingExecutionTraceEntry["sourceReads"][number]["status"]
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
        <div className="mt-2 flex flex-col gap-1">
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

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Unavailable"
  }

  if (typeof value === "string") {
    return value
  }

  return JSON.stringify(value) ?? "Unavailable"
}
