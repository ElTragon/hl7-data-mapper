import {
  REVIEW_DECISION_REASON_LABELS,
  type NormalizedOutput,
  type ReportReviewDecision,
  type ValidationSummary,
} from "@hl7-data-mapper/contracts"

import type {
  BuildReportPackageInput,
  MappingSummaryRow,
  ReportExtractionSummary,
  ReportReviewSummary,
} from "./types.js"

export function buildMarkdownReport(
  input: BuildReportPackageInput,
  mappingSummaryRows: readonly MappingSummaryRow[],
): string {
  const extraction = buildExtractionSummary(input.normalizedData)
  const review = buildReviewSummary(input.reviewDecisions)
  const validation = input.validationResults

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
    `- Patient identifiers found: ${extraction.patientIdentifierCount}`,
    `- Coverage records found: ${extraction.coverageCount}`,
    `- Guarantor present: ${extraction.hasGuarantor ? "Yes" : "No"}`,
    `- Lab orders found: ${extraction.labOrderCount}`,
    `- Specimens found: ${extraction.specimenCount}`,
    "",
    "## Review summary",
    "",
    `- Total review decisions: ${review.total}`,
    `- Confirmed: ${review.confirmed}`,
    `- Mapping changed: ${review.mappingChanged}`,
    `- Incorrect: ${review.incorrect}`,
    `- Unavailable: ${review.unavailable}`,
    `- Still unreviewed: ${review.unreviewed}`,
    `- Mapping summary rows: ${mappingSummaryRows.length}`,
    "",
    "## Review explanations",
    "",
    ...buildReviewExplanationLines(input.reviewDecisions),
    "## Validation summary",
    "",
    `- Errors: ${validation.errors.length}`,
    `- Warnings: ${validation.warnings.length}`,
    `- Info: ${validation.info.length}`,
    "",
    ...buildValidationDetailLines(validation),
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

export function buildExtractionSummary(
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

export function buildReviewSummary(
  decisions: readonly ReportReviewDecision[],
): ReportReviewSummary {
  return {
    total: decisions.length,
    unreviewed: decisions.filter((d) => d.reviewStatus === "unreviewed").length,
    confirmed: decisions.filter((d) => d.reviewStatus === "confirmed").length,
    incorrect: decisions.filter((d) => d.reviewStatus === "incorrect").length,
    mappingChanged: decisions.filter(
      (d) => d.reviewStatus === "mapping_changed",
    ).length,
    unavailable: decisions.filter((d) => d.reviewStatus === "unavailable")
      .length,
  }
}

function buildValidationDetailLines(
  results: ValidationSummary,
): readonly string[] {
  const issues = [...results.errors, ...results.warnings, ...results.info]
  if (issues.length === 0) return ["No validation issues were reported.", ""]
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
  const explained = decisions.filter((d) => d.reasonCode || d.reviewNote)
  if (explained.length === 0)
    return ["No review explanations were recorded.", ""]
  return [
    ...explained.map((decision) => {
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

function sanitizeMarkdownText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "\\`")
    .replace(/[\r\n]+/g, " ")
}
