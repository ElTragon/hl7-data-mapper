import { useMemo, useState, type ChangeEvent } from "react"
import { AlertCircle, CheckCircle2, Download, FileText } from "lucide-react"

import {
  parseHl7Message,
  type ParsedHl7Message,
} from "@hl7-data-mapper/hl7-parser"
import {
  buildReviewableFields,
  composeDefaultNormalizedOutput,
  defaultOmlO21ClientProfile,
  executeMapping,
} from "@hl7-data-mapper/mapping-engine"
import {
  buildReportPackage,
  buildReportZip,
} from "@hl7-data-mapper/report-generator"

import sampleHl7Message from "../../../../../fixtures/valid/oml-o21-basic.hl7?raw"
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
  }

  function handleLoadSample() {
    setRawMessage(sampleHl7Message.trim())
    setParsedMessage(null)
    setInputError(null)
    setReportStatus("idle")
    setReportError(null)
  }

  function handleParse() {
    setParsedMessage(parseHl7Message(rawMessage))
    setInputError(null)
    setReportStatus("idle")
    setReportError(null)
  }

  async function handleDownloadReport() {
    if (!parsedMessage || parsedMessage.errors.length > 0) {
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
          hl7Items: defaultOmlO21ClientProfile.itemSet.items,
          reviewDecisions: buildReportReviewDecisions(mappingResult),
          validationResults: mappingResult.validation,
        },
        async ({ content }) => sha256Hex(content),
      )
      const zipPackage = buildReportZip(reportPackage, {
        rootFolderName: defaultOmlO21ClientProfile.clientId,
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
    </section>
  )
}

function buildReportReviewDecisions(
  mappingResult: ReturnType<typeof executeMapping>,
) {
  const reviewFields = buildReviewableFields({
    mappingResult,
    profile: defaultOmlO21ClientProfile,
  })

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
