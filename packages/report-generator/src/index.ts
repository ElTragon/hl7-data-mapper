import {
  HASHED_REPORT_FILE_NAMES,
  MAPPING_SUMMARY_CSV_COLUMNS,
  ReportManifestSchema,
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
}

export type BuildReportPackageInput = {
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
}

export type ReportPackage = {
  readonly manifest: ReportManifest
  readonly files: readonly ReportFile[]
}

export async function buildReportPackage(
  input: BuildReportPackageInput,
  hashContent: ReportContentHasher,
): Promise<ReportPackage> {
  const payloadFiles = buildPayloadFiles(input)
  const includedFiles = await buildManifestEntries(payloadFiles, hashContent)
  const manifest = ReportManifestSchema.parse({
    schemaVersion: "1.0.0",
    appName: "HL7 Data Mapper",
    generatedAt: input.generatedAt,
    clientId: input.clientId,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    hl7Version: "2.5.1",
    messageType: "OML^O21",
    messageStructure: "OML_O21",
    messageControlId: input.messageControlId,
    messageHash: input.messageHash,
    sourcePolicy: input.sourcePolicy ?? "raw_source_excluded",
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

function buildPayloadFiles(
  input: BuildReportPackageInput,
): readonly ReportPayloadFile[] {
  const mappingSummaryRows = buildMappingSummaryRows(input.reviewDecisions)

  return [
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

  return HASHED_REPORT_FILE_NAMES.map((fileName) => {
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
  const validationCounts = {
    errors: input.validationResults.errors.length,
    warnings: input.validationResults.warnings.length,
    info: input.validationResults.info.length,
  }
  const reviewedCount = input.reviewDecisions.filter(
    (decision) => decision.reviewStatus !== "unreviewed",
  ).length

  return [
    "# HL7 Data Mapper Report",
    "",
    "## Run summary",
    "",
    `- Client ID: ${input.clientId}`,
    `- Profile ID: ${input.profileId}`,
    `- Profile version: ${input.profileVersion}`,
    "- HL7 version: 2.5.1",
    "- Message type: OML^O21",
    `- Message control ID: ${input.messageControlId ?? "Unavailable"}`,
    `- Source message hash: ${input.messageHash}`,
    `- Source policy: ${input.sourcePolicy ?? "raw_source_excluded"}`,
    `- Generated at: ${input.generatedAt}`,
    "",
    "## Review summary",
    "",
    `- Reviewed fields: ${reviewedCount}`,
    `- Total review decisions: ${input.reviewDecisions.length}`,
    `- Mapping summary rows: ${mappingSummaryRows.length}`,
    "",
    "## Validation summary",
    "",
    `- Errors: ${validationCounts.errors}`,
    `- Warnings: ${validationCounts.warnings}`,
    `- Info: ${validationCounts.info}`,
    "",
    "## Included files",
    "",
    "- `manifest.json`: report table of contents",
    "- `normalized-data.json`: normalized synthetic extraction output",
    "- `hl7-items.json`: mapping rules used for the run",
    "- `review-decisions.json`: guided-review decisions",
    "- `validation-results.json`: structured validation results",
    "- `mapping-summary.csv`: spreadsheet-friendly mapping summary",
    "",
    "Raw HL7 source text is excluded from the required public-demo report.",
    "",
  ].join("\n")
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
  const order: readonly ReportFileName[] = [
    "REPORT.md",
    "manifest.json",
    "normalized-data.json",
    "hl7-items.json",
    "review-decisions.json",
    "validation-results.json",
    "mapping-summary.csv",
  ]

  return order.map((fileName) => {
    const file = files.find((candidate) => candidate.fileName === fileName)

    if (!file) {
      throw new Error(`Missing report file: ${fileName}`)
    }

    return file
  })
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

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value
  }

  return `"${value.replaceAll('"', '""')}"`
}
