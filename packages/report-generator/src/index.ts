import {
  Hl7ItemSchema,
  MAPPING_SUMMARY_CSV_COLUMNS,
  REVIEW_DECISION_REASON_LABELS,
  REPORT_CONTRACT_SCHEMA_VERSION,
  REQUIRED_REPORT_FILE_NAMES,
  NormalizedOutputSchema,
  ReportManifestSchema,
  ReportReviewDecisionSchema,
  ValidationSummarySchema,
  type Hl7Item,
  type MessageHash,
  type NormalizedOutput,
  type ReportFileManifestEntry,
  type ReportFileName,
  type ReportManifest,
  type ReportPayloadFileName,
  type ReportReviewDecision,
  type ReportSourcePolicy,
  type ValidationSummary,
} from "@hl7-data-mapper/contracts"
import { strToU8, zipSync } from "fflate"

export type ReportFile = {
  readonly fileName: ReportFileName
  readonly mediaType: string
  readonly content: string
}

export type ReportPayloadFile = ReportFile & {
  readonly fileName: ReportPayloadFileName
}

export type ReportContentHashInput = {
  readonly fileName: ReportPayloadFileName
  readonly content: string
}

export type ReportContentHasher = (
  input: ReportContentHashInput,
) => MessageHash | Promise<MessageHash>

export type MappingSummaryRow = {
  readonly section: string
  readonly targetPath: string
  readonly valueStatus: string
  readonly sourcePath: string
  readonly hl7ItemId: string
  readonly reviewStatus: string
  readonly transformApplied: string
  readonly reviewReason: string
  readonly reviewNote: string
}

export type ReportExtractionSummary = {
  readonly patientIdentifierCount: number
  readonly coverageCount: number
  readonly hasGuarantor: boolean
  readonly labOrderCount: number
  readonly specimenCount: number
}

export type ReportReviewSummary = {
  readonly total: number
  readonly unreviewed: number
  readonly confirmed: number
  readonly incorrect: number
  readonly mappingChanged: number
  readonly unavailable: number
}

export type BuildReportPackageInput = {
  readonly appVersion: string
  readonly generatedAt: string
  readonly clientId: string
  readonly profileId: string
  readonly profileVersion: number
  readonly messageHash: MessageHash
  readonly messageControlId?: string | null
  readonly sourcePolicy?: ReportSourcePolicy
  readonly normalizedData: NormalizedOutput
  readonly hl7Items: readonly Hl7Item[]
  readonly reviewDecisions: readonly ReportReviewDecision[]
  readonly validationResults: ValidationSummary
  readonly syntheticSourceText?: string | null
}

export type ReportPackage = {
  readonly manifest: ReportManifest
  readonly files: readonly ReportFile[]
}

export type ReportZipOptions = {
  readonly rootFolderName?: string
}

export type ReportZipEntry = {
  readonly path: string
  readonly uncompressedSize: number
}

export type ReportZipPackage = {
  readonly fileName: string
  readonly mediaType: "application/zip"
  readonly content: Uint8Array
  readonly entries: readonly ReportZipEntry[]
}

export async function buildReportPackage(
  input: BuildReportPackageInput,
  hashContent: ReportContentHasher,
): Promise<ReportPackage> {
  const reportInput = validateReportInput(input)
  const payloadFiles = buildPayloadFiles(reportInput)
  const includedFiles = await buildManifestEntries(payloadFiles, hashContent)
  const manifest = ReportManifestSchema.parse({
    schemaVersion: REPORT_CONTRACT_SCHEMA_VERSION,
    appName: "HL7 Data Mapper",
    appVersion: reportInput.appVersion,
    generatedAt: reportInput.generatedAt,
    clientId: reportInput.clientId,
    profileId: reportInput.profileId,
    profileVersion: reportInput.profileVersion,
    hl7Version: "2.5.1",
    messageType: "OML^O21",
    messageStructure: "OML_O21",
    messageControlId: reportInput.messageControlId,
    messageHash: reportInput.messageHash,
    sourcePolicy: reportInput.sourcePolicy ?? "raw_source_excluded",
    generatedBy: "browser",
    includedFiles,
  })
  const manifestFile: ReportFile = {
    fileName: "manifest.json",
    mediaType: "application/json",
    content: toPrettyJson(manifest),
  }

  return {
    manifest,
    files: orderReportFiles([...payloadFiles, manifestFile]),
  }
}

export function buildReportZip(
  reportPackage: ReportPackage,
  options: ReportZipOptions = {},
): ReportZipPackage {
  const rootFolderName = normalizeZipFolderName(
    options.rootFolderName ?? "hl7-data-mapper-report",
  )
  const zipEntries = reportPackage.files.map((file) => {
    const path = `${rootFolderName}/${file.fileName}`
    const bytes = strToU8(file.content)

    return {
      path,
      bytes,
    }
  })
  const zippedFiles = Object.fromEntries(
    zipEntries.map((entry) => [entry.path, entry.bytes]),
  )

  return {
    fileName: `${rootFolderName}.zip`,
    mediaType: "application/zip",
    content: zipSync(zippedFiles),
    entries: zipEntries.map((entry) => ({
      path: entry.path,
      uncompressedSize: entry.bytes.byteLength,
    })),
  }
}

function validateReportInput(
  input: BuildReportPackageInput,
): BuildReportPackageInput {
  if (input.sourcePolicy === "synthetic_source_included") {
    if (!input.syntheticSourceText?.trim()) {
      throw new Error(
        "syntheticSourceText is required when sourcePolicy is synthetic_source_included.",
      )
    }
  }

  if (
    input.sourcePolicy !== "synthetic_source_included" &&
    input.syntheticSourceText
  ) {
    throw new Error(
      "syntheticSourceText can only be included with the synthetic_source_included policy.",
    )
  }

  return {
    ...input,
    normalizedData: NormalizedOutputSchema.parse(input.normalizedData),
    hl7Items: input.hl7Items.map((item) => Hl7ItemSchema.parse(item)),
    reviewDecisions: input.reviewDecisions.map((decision) =>
      ReportReviewDecisionSchema.parse(decision),
    ),
    validationResults: ValidationSummarySchema.parse(input.validationResults),
  }
}

function buildPayloadFiles(
  input: BuildReportPackageInput,
): readonly ReportPayloadFile[] {
  const mappingSummaryRows = buildMappingSummaryRows(input.reviewDecisions)
  const requiredFiles: ReportPayloadFile[] = [
    {
      fileName: "REPORT.md",
      mediaType: "text/markdown",
      content: buildMarkdownReport(input, mappingSummaryRows),
    },
    {
      fileName: "normalized-data.json",
      mediaType: "application/json",
      content: toPrettyJson(input.normalizedData),
    },
    {
      fileName: "hl7-items.json",
      mediaType: "application/json",
      content: toPrettyJson(input.hl7Items),
    },
    {
      fileName: "review-decisions.json",
      mediaType: "application/json",
      content: toPrettyJson(input.reviewDecisions),
    },
    {
      fileName: "validation-results.json",
      mediaType: "application/json",
      content: toPrettyJson(input.validationResults),
    },
    {
      fileName: "mapping-summary.csv",
      mediaType: "text/csv",
      content: buildMappingSummaryCsv(mappingSummaryRows),
    },
  ]

  if (input.sourcePolicy !== "synthetic_source_included") {
    return requiredFiles
  }

  return [
    ...requiredFiles,
    {
      fileName: "source.hl7",
      mediaType: "text/plain",
      content: input.syntheticSourceText ?? "",
    },
  ]
}

async function buildManifestEntries(
  files: readonly ReportPayloadFile[],
  hashContent: ReportContentHasher,
): Promise<readonly ReportFileManifestEntry[]> {
  const entries = await Promise.all(
    files.map(async (file) => ({
      fileName: file.fileName,
      mediaType: file.mediaType,
      byteLength: getUtf8ByteLength(file.content),
      sha256: await hashContent({
        fileName: file.fileName,
        content: file.content,
      }),
    })),
  )

  return files
    .map((file) => file.fileName)
    .map((fileName) => {
      const entry = entries.find((candidate) => candidate.fileName === fileName)

      if (!entry) {
        throw new Error(`Missing report payload file: ${fileName}`)
      }

      return entry
    })
}

function buildMarkdownReport(
  input: BuildReportPackageInput,
  mappingSummaryRows: readonly MappingSummaryRow[],
): string {
  const extractionSummary = buildExtractionSummary(input.normalizedData)
  const reviewSummary = buildReviewSummary(input.reviewDecisions)
  const validationCounts = {
    errors: input.validationResults.errors.length,
    warnings: input.validationResults.warnings.length,
    info: input.validationResults.info.length,
  }
  const validationDetailLines = buildValidationDetailLines(
    input.validationResults,
  )

  return [
    "# HL7 Data Mapper Report",
    "",
    "## Run summary",
    "",
    `- Client ID: ${input.clientId}`,
    `- Profile ID: ${input.profileId}`,
    `- Profile version: ${input.profileVersion}`,
    `- App version: ${input.appVersion}`,
    "- HL7 version: 2.5.1",
    "- Message type: OML^O21",
    `- Message control ID: ${input.messageControlId ?? "Unavailable"}`,
    `- Source message hash: ${input.messageHash}`,
    `- Source policy: ${input.sourcePolicy ?? "raw_source_excluded"}`,
    `- Generated at: ${input.generatedAt}`,
    "",
    "## Extraction summary",
    "",
    `- Patient identifiers found: ${extractionSummary.patientIdentifierCount}`,
    `- Coverage records found: ${extractionSummary.coverageCount}`,
    `- Guarantor present: ${formatYesNo(extractionSummary.hasGuarantor)}`,
    `- Lab orders found: ${extractionSummary.labOrderCount}`,
    `- Specimens found: ${extractionSummary.specimenCount}`,
    "",
    "## Review summary",
    "",
    `- Total review decisions: ${reviewSummary.total}`,
    `- Confirmed: ${reviewSummary.confirmed}`,
    `- Mapping changed: ${reviewSummary.mappingChanged}`,
    `- Incorrect: ${reviewSummary.incorrect}`,
    `- Unavailable: ${reviewSummary.unavailable}`,
    `- Still unreviewed: ${reviewSummary.unreviewed}`,
    `- Mapping summary rows: ${mappingSummaryRows.length}`,
    "",
    "## Review explanations",
    "",
    ...buildReviewExplanationLines(input.reviewDecisions),
    "## Validation summary",
    "",
    `- Errors: ${validationCounts.errors}`,
    `- Warnings: ${validationCounts.warnings}`,
    `- Info: ${validationCounts.info}`,
    "",
    ...validationDetailLines,
    "## Included files",
    "",
    "- `manifest.json`: report table of contents",
    "- `normalized-data.json`: normalized synthetic extraction output",
    "- `hl7-items.json`: mapping rules used for the run",
    "- `review-decisions.json`: guided-review decisions",
    "- `validation-results.json`: structured validation results",
    "- `mapping-summary.csv`: spreadsheet-friendly mapping summary",
    ...(input.sourcePolicy === "synthetic_source_included"
      ? ["- `source.hl7`: explicitly synthetic source message"]
      : []),
    "",
    "## Privacy note",
    "",
    input.sourcePolicy === "synthetic_source_included"
      ? "The included source message is marked synthetic by policy."
      : "Raw HL7 source text is excluded from the required public-demo report.",
    "The public demo is designed for synthetic data only.",
    "",
  ].join("\n")
}

function buildExtractionSummary(
  normalizedData: NormalizedOutput,
): ReportExtractionSummary {
  return {
    patientIdentifierCount: normalizedData.patient.identifiers.length,
    coverageCount: normalizedData.coverages.length,
    hasGuarantor: normalizedData.guarantor !== null,
    labOrderCount: normalizedData.labOrders.length,
    specimenCount: normalizedData.labOrders.reduce(
      (count, order) => count + order.specimens.length,
      0,
    ),
  }
}

function buildReviewSummary(
  decisions: readonly ReportReviewDecision[],
): ReportReviewSummary {
  return {
    total: decisions.length,
    unreviewed: decisions.filter(
      (decision) => decision.reviewStatus === "unreviewed",
    ).length,
    confirmed: decisions.filter(
      (decision) => decision.reviewStatus === "confirmed",
    ).length,
    incorrect: decisions.filter(
      (decision) => decision.reviewStatus === "incorrect",
    ).length,
    mappingChanged: decisions.filter(
      (decision) => decision.reviewStatus === "mapping_changed",
    ).length,
    unavailable: decisions.filter(
      (decision) => decision.reviewStatus === "unavailable",
    ).length,
  }
}

function buildValidationDetailLines(
  validationResults: ValidationSummary,
): readonly string[] {
  const issues = [
    ...validationResults.errors,
    ...validationResults.warnings,
    ...validationResults.info,
  ]

  if (issues.length === 0) {
    return ["No validation issues were reported.", ""]
  }

  return [
    "### Validation details",
    "",
    ...issues.map((issue) => {
      const location = issue.section ?? issue.segment ?? issue.path

      return `- ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}${location ? ` (${location})` : ""}`
    }),
    "",
  ]
}

function buildReviewExplanationLines(
  decisions: readonly ReportReviewDecision[],
): readonly string[] {
  const explainedDecisions = decisions.filter(
    (decision) => decision.reasonCode || decision.reviewNote,
  )

  if (explainedDecisions.length === 0) {
    return ["No review explanations were recorded.", ""]
  }

  return [
    ...explainedDecisions.map((decision) => {
      const reason = decision.reasonCode
        ? REVIEW_DECISION_REASON_LABELS[decision.reasonCode]
        : "No structured reason"
      const note = decision.reviewNote
        ? sanitizeMarkdownText(decision.reviewNote)
        : "No note provided"

      return `- **${sanitizeMarkdownText(decision.normalizedPath)}** (${decision.reviewStatus}; ${reason}): ${note}`
    }),
    "",
  ]
}

function buildMappingSummaryRows(
  decisions: readonly ReportReviewDecision[],
): readonly MappingSummaryRow[] {
  return decisions.map((decision) => ({
    section: getSectionFromNormalizedPath(decision.normalizedPath),
    targetPath: decision.normalizedPath,
    valueStatus: decision.correctionApplied
      ? "mapping_changed"
      : decision.reviewStatus,
    sourcePath: decision.sourcePath ?? "",
    hl7ItemId: decision.hl7ItemId ?? "",
    reviewStatus: decision.reviewStatus,
    transformApplied: decision.correctionApplied ? "source_replaced" : "",
    reviewReason: decision.reasonCode
      ? REVIEW_DECISION_REASON_LABELS[decision.reasonCode]
      : "",
    reviewNote: decision.reviewNote ?? "",
  }))
}

function buildMappingSummaryCsv(rows: readonly MappingSummaryRow[]): string {
  return [
    MAPPING_SUMMARY_CSV_COLUMNS.join(","),
    ...rows.map((row) =>
      MAPPING_SUMMARY_CSV_COLUMNS.map((column) =>
        escapeCsvCell(row[column]),
      ).join(","),
    ),
  ].join("\n")
}

function orderReportFiles(files: readonly ReportFile[]): readonly ReportFile[] {
  const optionalFiles = files.filter(
    (file) =>
      !REQUIRED_REPORT_FILE_NAMES.some(
        (fileName) => fileName === file.fileName,
      ),
  )

  return [
    ...REQUIRED_REPORT_FILE_NAMES.map((fileName) => {
      const file = files.find((candidate) => candidate.fileName === fileName)

      if (!file) {
        throw new Error(`Missing report file: ${fileName}`)
      }

      return file
    }),
    ...optionalFiles,
  ]
}

function toPrettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function getUtf8ByteLength(value: string): number {
  let byteLength = 0

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0

    if (codePoint <= 0x7f) {
      byteLength += 1
    } else if (codePoint <= 0x7ff) {
      byteLength += 2
    } else if (codePoint <= 0xffff) {
      byteLength += 3
    } else {
      byteLength += 4
    }
  }

  return byteLength
}

function getSectionFromNormalizedPath(path: string): string {
  return path.split(".")[0] ?? path
}

function formatYesNo(value: boolean): string {
  return value ? "Yes" : "No"
}

function escapeCsvCell(value: string): string {
  const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value

  if (!/[",\n\r]/.test(safeValue)) {
    return safeValue
  }

  return `"${safeValue.replaceAll('"', '""')}"`
}

function sanitizeMarkdownText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "\\`")
    .replace(/[\r\n]+/g, " ")
}

function normalizeZipFolderName(folderName: string): string {
  return (
    folderName
      .trim()
      .replaceAll("\\", "/")
      .split("/")
      .filter(Boolean)
      .join("-") || "hl7-data-mapper-report"
  )
}
