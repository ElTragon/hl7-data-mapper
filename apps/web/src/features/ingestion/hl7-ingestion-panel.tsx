import { useMemo, useState, type ChangeEvent } from "react"
import { AlertCircle, CheckCircle2, Download, FileText } from "lucide-react"

import {
  type ClientProfile,
  type GuidedReviewStepId,
  type ReviewableField,
  type SourceReference,
} from "@hl7-data-mapper/contracts"
import {
  parseHl7Message,
  type ParsedHl7Message,
} from "@hl7-data-mapper/hl7-parser"
import {
  applyReviewCorrectionAndRerunMapping,
  buildReviewableFields,
  composeDefaultNormalizedOutput,
  defaultOmlO21ClientProfile,
  executeMapping,
  confirmReviewableField,
  markReviewableFieldIncorrect,
  markReviewableFieldUnavailable,
  selectCompositeSourceForReviewableField,
  selectAlternateSourceForReviewableField,
  type MappingExecutionResult,
  type PersonNameSourceRole,
} from "@hl7-data-mapper/mapping-engine"
import {
  buildReportPackage,
  buildReportZip,
} from "@hl7-data-mapper/report-generator"

import sampleHl7Message from "../../../../../fixtures/valid/oml-o21-basic.hl7?raw"
import {
  createDemoDraftProfile,
  getStoredDraftProfile,
  loadDemoSnapshot,
  resetStoredDemoSnapshot,
  saveReviewWorkspaceSnapshot,
} from "./demo-storage"
import { GuidedReviewWorkspace } from "./guided-review-workspace"
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
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

const MAX_FILE_SIZE_BYTES = 1024 * 1024
const REPORT_APP_VERSION = "0.1.0"
const DEFAULT_REVIEW_STEP: GuidedReviewStepId = "patient"

function getSegmentCount(parsed: ParsedHl7Message, segmentName: string) {
  return parsed.segments.filter((segment) => segment.name === segmentName)
    .length
}

export function Hl7IngestionPanel() {
  const [rawMessage, setRawMessage] = useState(sampleHl7Message.trim())
  const [parsedMessage, setParsedMessage] = useState<ParsedHl7Message | null>(
    null,
  )
  const [inputError, setInputError] = useState<string | null>(null)
  const [reportStatus, setReportStatus] = useState<
    "idle" | "generating" | "downloaded"
  >("idle")
  const [reportError, setReportError] = useState<string | null>(null)
  const [workflowState, setWorkflowState] = useState<
    "input" | "parsed" | "review"
  >("input")
  const [activeProfile, setActiveProfile] = useState<ClientProfile | null>(null)
  const [mappingResult, setMappingResult] =
    useState<MappingExecutionResult | null>(null)
  const [reviewFields, setReviewFields] = useState<ReviewableField[]>([])
  const [activeStepId, setActiveStepId] =
    useState<GuidedReviewStepId>(DEFAULT_REVIEW_STEP)
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)

  const summary = useMemo(() => {
    if (!parsedMessage) {
      return null
    }

    return {
      segmentCount: parsedMessage.segments.length,
      orderCount: getSegmentCount(parsedMessage, "ORC"),
      specimenCount: getSegmentCount(parsedMessage, "SPM"),
      patientFound: getSegmentCount(parsedMessage, "PID") > 0,
    }
  }, [parsedMessage])

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setInputError("File is larger than the 1 MiB MVP ingestion limit.")
      return
    }

    const text = await file.text()
    setRawMessage(text)
    setParsedMessage(null)
    setInputError(null)
    setReportStatus("idle")
    setReportError(null)
    clearReviewState()
  }

  function handleLoadSample() {
    setRawMessage(sampleHl7Message.trim())
    setParsedMessage(null)
    setInputError(null)
    setReportStatus("idle")
    setReportError(null)
    clearReviewState()
  }

  function handleParse() {
    const parsed = parseHl7Message(rawMessage)

    setParsedMessage(parsed)
    setInputError(null)
    setReportStatus("idle")
    setReportError(null)
    setWorkflowState("parsed")

    if (parsed.errors.length > 0) {
      setActiveProfile(null)
      setMappingResult(null)
      setReviewFields([])
      setSelectedFieldId(null)
      return
    }

    startReview(parsed)
  }

  async function handleDownloadReport() {
    if (
      !parsedMessage ||
      parsedMessage.errors.length > 0 ||
      !activeProfile ||
      !mappingResult
    ) {
      setReportError("Parse a valid synthetic OML/O21 message first.")
      return
    }

    setReportStatus("generating")
    setReportError(null)

    try {
      const mappingResult = executeMapping({
        parsedMessage,
        profile: defaultOmlO21ClientProfile,
      })
      const normalizedData = composeDefaultNormalizedOutput(parsedMessage)
      const reportPackage = await buildReportPackage(
        {
          appVersion: REPORT_APP_VERSION,
          generatedAt: new Date().toISOString(),
          clientId: defaultOmlO21ClientProfile.clientId,
          profileId: defaultOmlO21ClientProfile.profileId,
          profileVersion: defaultOmlO21ClientProfile.profileVersion,
          messageHash: await sha256Hex(rawMessage),
          messageControlId: parsedMessage.segments
            .find((segment) => segment.name === "MSH")
            ?.fields.find((field) => field.index === 10)?.raw,
          sourcePolicy: "raw_source_excluded",
          normalizedData,
          hl7Items: activeProfile.itemSet.items,
          reviewDecisions: buildReportReviewDecisions(reviewFields),
          validationResults: mappingResult.validation,
        },
        async ({ content }) => sha256Hex(content),
      )
      const zipPackage = buildReportZip(reportPackage, {
        rootFolderName: activeProfile.clientId,
      })

      downloadBytes({
        bytes: zipPackage.content,
        fileName: zipPackage.fileName,
        mediaType: zipPackage.mediaType,
      })
      setReportStatus("downloaded")
    } catch (error) {
      setReportStatus("idle")
      setReportError(
        error instanceof Error
          ? error.message
          : "Could not generate the report ZIP.",
      )
    }
  }

  function clearReviewState() {
    setWorkflowState("input")
    setActiveProfile(null)
    setMappingResult(null)
    setReviewFields([])
    setActiveStepId(DEFAULT_REVIEW_STEP)
    setSelectedFieldId(null)
  }

  function startReview(parsed: ParsedHl7Message) {
    const now = new Date().toISOString()
    const draftProfile =
      getStoredDraftProfile(defaultOmlO21ClientProfile) ??
      createDemoDraftProfile({
        sourceProfile: defaultOmlO21ClientProfile,
        createdAt: now,
      })
    const nextMappingResult = executeMapping({
      parsedMessage: parsed,
      profile: draftProfile,
    })
    const storedFields = buildReviewableFields({
      mappingResult: nextMappingResult,
      profile: draftProfile,
    })
    const nextFields = applyStoredReviewStatuses(storedFields)

    setActiveProfile(draftProfile)
    setMappingResult(nextMappingResult)
    setReviewFields(nextFields)
    setWorkflowState("review")
    setActiveStepId(DEFAULT_REVIEW_STEP)
    setSelectedFieldId(
      nextFields.find((field) => field.stepId === DEFAULT_REVIEW_STEP)?.id ??
        nextFields[0]?.id ??
        null,
    )
    saveReviewWorkspaceSnapshot({
      profile: draftProfile,
      reviewFields: nextFields,
      updatedAt: now,
    })
  }

  function persistReviewState({
    profile = activeProfile,
    fields,
  }: {
    readonly profile?: ClientProfile | null
    readonly fields: readonly ReviewableField[]
  }) {
    if (!profile) {
      return
    }

    saveReviewWorkspaceSnapshot({
      profile,
      reviewFields: fields,
      updatedAt: new Date().toISOString(),
    })
  }

  function updateReviewField(updatedField: ReviewableField) {
    const nextFields = reviewFields.map((field) =>
      field.id === updatedField.id ? updatedField : field,
    )

    setReviewFields(nextFields)
    setSelectedFieldId(updatedField.id)
    persistReviewState({ fields: nextFields })
  }

  function handleActiveStepChange(stepId: GuidedReviewStepId) {
    setActiveStepId(stepId)
    setSelectedFieldId(
      reviewFields.find((field) => field.stepId === stepId)?.id ?? null,
    )
  }

  function handleApplySource(
    field: ReviewableField,
    source: SourceReference,
    sourceRole?: PersonNameSourceRole,
  ) {
    if (!parsedMessage || !activeProfile) {
      return
    }

    const replacementSource = {
      ...source,
      raw: undefined,
    }
    const correctedField = sourceRole
      ? selectCompositeSourceForReviewableField({
          profile: activeProfile,
          field,
          replacementSource,
          sourceRole,
          rawSegment: source.raw,
          notes: `Use ${replacementSource.path} as ${sourceRole} for ${field.normalizedPath}.`,
        })
      : selectAlternateSourceForReviewableField({
          field,
          replacementSource,
          rawSegment: source.raw,
          notes: `Use ${replacementSource.path} for ${field.normalizedPath}.`,
        })
    const result = applyReviewCorrectionAndRerunMapping({
      parsedMessage,
      profile: activeProfile,
      field: correctedField,
      updatedAt: new Date().toISOString(),
    })
    const nextFields = mergeReviewFields({
      previousFields: reviewFields,
      nextFields: result.reviewFields,
      overrideFieldId: field.id,
      overrideStatus: "mapping_changed",
      correctionIntent: correctedField.correctionIntent ?? null,
    })

    setActiveProfile(result.profile)
    setMappingResult(result.mappingResult)
    setReviewFields(nextFields)
    setSelectedFieldId(field.id)
    persistReviewState({
      profile: result.profile,
      fields: nextFields,
    })
  }

  function handleResetDemo() {
    resetStoredDemoSnapshot(new Date().toISOString())

    if (parsedMessage && parsedMessage.errors.length === 0) {
      const draftProfile = createDemoDraftProfile({
        sourceProfile: defaultOmlO21ClientProfile,
        createdAt: new Date().toISOString(),
      })
      const nextMappingResult = executeMapping({
        parsedMessage,
        profile: draftProfile,
      })
      const nextFields = buildReviewableFields({
        mappingResult: nextMappingResult,
        profile: draftProfile,
      })

      setActiveProfile(draftProfile)
      setMappingResult(nextMappingResult)
      setReviewFields(nextFields)
      setActiveStepId(DEFAULT_REVIEW_STEP)
      setSelectedFieldId(
        nextFields.find((field) => field.stepId === DEFAULT_REVIEW_STEP)?.id ??
          nextFields[0]?.id ??
          null,
      )
    }
  }

  return (
    <section id="ingestion" className="scroll-mt-8 border-b py-20">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
        <div className="flex flex-col gap-5">
          <div>
            <Badge variant="secondary">Message intake</Badge>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Try HL7 ingestion.
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Paste, edit, upload, or load a synthetic OML/O21 message. The app
              parses it locally and shows the message structure before any
              business-field mapping happens.
            </p>
          </div>

          <Alert>
            <AlertCircle />
            <AlertTitle>Synthetic data only</AlertTitle>
            <AlertDescription>
              Do not upload real PHI. This portfolio demo keeps ingestion in
              browser state and does not persist uploaded source messages.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Message input</CardTitle>
              <CardDescription>
                Supports pasted text, local `.hl7` / `.txt` files, and the
                built-in synthetic sample.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="hl7-file">
                  Upload HL7 file
                </label>
                <Input
                  id="hl7-file"
                  type="file"
                  accept=".hl7,.txt,text/plain"
                  onChange={(event) => void handleFileChange(event)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="hl7-message">
                  Editable HL7 message
                </label>
                <Textarea
                  id="hl7-message"
                  className="min-h-80 font-mono text-xs leading-5"
                  value={rawMessage}
                  onChange={(event) => {
                    setRawMessage(event.target.value)
                    setParsedMessage(null)
                    setInputError(null)
                    setReportStatus("idle")
                    setReportError(null)
                  }}
                  spellCheck={false}
                />
              </div>

              {inputError ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Input issue</AlertTitle>
                  <AlertDescription>{inputError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button onClick={handleParse} disabled={!rawMessage.trim()}>
                  <FileText data-icon="inline-start" />
                  Parse message
                </Button>
                <Button variant="outline" onClick={handleLoadSample}>
                  Load synthetic sample
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Parse result</CardTitle>
            <CardDescription>
              Review the structural facts the parser found before extraction.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {parsedMessage ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SummaryItem label="Message type">
                    {parsedMessage.messageType.raw ?? "Unavailable"}
                  </SummaryItem>
                  <SummaryItem label="HL7 version">
                    {parsedMessage.version ?? "Unavailable"}
                  </SummaryItem>
                  <SummaryItem label="Segments">
                    {summary?.segmentCount}
                  </SummaryItem>
                  <SummaryItem label="Orders">
                    {summary?.orderCount}
                  </SummaryItem>
                  <SummaryItem label="Specimens">
                    {summary?.specimenCount}
                  </SummaryItem>
                  <SummaryItem label="Patient segment">
                    {summary?.patientFound ? "Found" : "Missing"}
                  </SummaryItem>
                </div>

                <Alert
                  variant={
                    parsedMessage.errors.length > 0 ? "destructive" : "default"
                  }
                >
                  {parsedMessage.errors.length > 0 ? (
                    <AlertCircle />
                  ) : (
                    <CheckCircle2 />
                  )}
                  <AlertTitle>
                    {parsedMessage.errors.length > 0
                      ? "Review blocked"
                      : "Message can continue to review"}
                  </AlertTitle>
                  <AlertDescription>
                    {parsedMessage.errors.length} error
                    {parsedMessage.errors.length === 1 ? "" : "s"} and{" "}
                    {parsedMessage.warnings.length} warning
                    {parsedMessage.warnings.length === 1 ? "" : "s"} found.
                  </AlertDescription>
                </Alert>

                <IssueList parsedMessage={parsedMessage} />

                <Card className="bg-teal-50/70">
                  <CardHeader>
                    <CardTitle>Report export</CardTitle>
                    <CardDescription>
                      Build a browser-only ZIP report from the synthetic
                      normalized output, default mapping profile, review
                      decisions, and validation results.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-muted-foreground">
                      {reportStatus === "downloaded"
                        ? "Report ZIP generated successfully."
                        : "Raw HL7 source text is excluded from the default report."}
                    </div>
                    <Button
                      type="button"
                      onClick={() => void handleDownloadReport()}
                      disabled={
                        parsedMessage.errors.length > 0 ||
                        reportStatus === "generating"
                      }
                    >
                      <Download data-icon="inline-start" />
                      {reportStatus === "generating"
                        ? "Building report..."
                        : "Download report ZIP"}
                    </Button>
                  </CardContent>
                </Card>

                {workflowState === "parsed" &&
                parsedMessage.errors.length === 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setWorkflowState("review")}
                  >
                    Open guided review
                  </Button>
                ) : null}

                {reportError ? (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertTitle>Report issue</AlertTitle>
                    <AlertDescription>{reportError}</AlertDescription>
                  </Alert>
                ) : null}

                <Separator />

                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-medium">Segments found</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Index</TableHead>
                        <TableHead>Segment</TableHead>
                        <TableHead>Fields</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedMessage.segments.map((segment) => (
                        <TableRow key={`${segment.name}-${segment.index}`}>
                          <TableCell>{segment.index + 1}</TableCell>
                          <TableCell className="font-mono">
                            {segment.name}
                          </TableCell>
                          <TableCell>{segment.fields.length}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="font-medium">No parse result yet</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Edit the synthetic message or upload a local file, then click
                  Parse message.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {parsedMessage &&
      activeProfile &&
      mappingResult &&
      workflowState === "review" ? (
        <div className="mx-auto mt-8 max-w-7xl px-5 lg:px-8">
          <GuidedReviewWorkspace
            parsedMessage={parsedMessage}
            profile={activeProfile}
            mappingResult={mappingResult}
            reviewFields={reviewFields}
            activeStepId={activeStepId}
            selectedFieldId={selectedFieldId}
            reportStatus={reportStatus}
            onActiveStepChange={handleActiveStepChange}
            onSelectedFieldChange={setSelectedFieldId}
            onConfirmField={(field) =>
              updateReviewField(confirmReviewableField(field))
            }
            onMarkIncorrect={(field) =>
              updateReviewField(markReviewableFieldIncorrect(field))
            }
            onMarkUnavailable={(field) =>
              updateReviewField(markReviewableFieldUnavailable(field))
            }
            onApplySource={handleApplySource}
            onDownloadReport={() => void handleDownloadReport()}
            onResetDemo={handleResetDemo}
          />
        </div>
      ) : null}
    </section>
  )
}

function buildReportReviewDecisions(reviewFields: readonly ReviewableField[]) {
  return reviewFields.map((field) => ({
    fieldId: field.id,
    normalizedPath: field.normalizedPath,
    hl7ItemId: field.hl7ItemId,
    reviewStatus: field.reviewStatus,
    sourcePath: field.primarySource?.path ?? null,
    correctionApplied: field.reviewStatus === "mapping_changed",
    updatedAt: new Date().toISOString(),
  }))
}

function applyStoredReviewStatuses(fields: ReviewableField[]) {
  const snapshot = loadDemoSnapshot()

  if (!snapshot) {
    return fields
  }

  const decisionByFieldId = new Map(
    snapshot.reviewDecisions.map((decision) => [decision.fieldId, decision]),
  )

  return fields.map((field) => {
    const decision = decisionByFieldId.get(field.id)

    if (!decision) {
      return field
    }

    return {
      ...field,
      reviewStatus: decision.reviewStatus,
    }
  })
}

function mergeReviewFields({
  previousFields,
  nextFields,
  overrideFieldId,
  overrideStatus,
  correctionIntent,
}: {
  readonly previousFields: readonly ReviewableField[]
  readonly nextFields: readonly ReviewableField[]
  readonly overrideFieldId: string
  readonly overrideStatus: ReviewableField["reviewStatus"]
  readonly correctionIntent: ReviewableField["correctionIntent"] | null
}) {
  const previousFieldById = new Map(
    previousFields.map((field) => [field.id, field]),
  )

  return nextFields.map((field) => {
    if (field.id === overrideFieldId) {
      return {
        ...field,
        reviewStatus: overrideStatus,
        correctionIntent,
      }
    }

    const previousField = previousFieldById.get(field.id)

    if (!previousField || previousField.reviewStatus === "unreviewed") {
      return field
    }

    return {
      ...field,
      reviewStatus: previousField.reviewStatus,
      correctionIntent: previousField.correctionIntent,
    }
  })
}

async function sha256Hex(value: string) {
  const encodedValue = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", encodedValue)

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function downloadBytes({
  bytes,
  fileName,
  mediaType,
}: {
  bytes: Uint8Array
  fileName: string
  mediaType: string
}) {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  const blob = new Blob([arrayBuffer], { type: mediaType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = fileName
  link.style.display = "none"

  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function SummaryItem({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{children}</p>
    </div>
  )
}

function IssueList({ parsedMessage }: { parsedMessage: ParsedHl7Message }) {
  const issues = [...parsedMessage.errors, ...parsedMessage.warnings]

  if (issues.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Validation messages</h3>
      <div className="flex flex-col gap-2">
        {issues.map((issue, index) => (
          <Alert
            key={`${issue.code}-${issue.segmentIndex ?? "message"}-${index}`}
            variant={issue.severity === "error" ? "destructive" : "default"}
          >
            <AlertCircle />
            <AlertTitle>
              {issue.severity === "error" ? "Error" : "Warning"} · {issue.code}
            </AlertTitle>
            <AlertDescription>{issue.message}</AlertDescription>
          </Alert>
        ))}
      </div>
    </div>
  )
}
