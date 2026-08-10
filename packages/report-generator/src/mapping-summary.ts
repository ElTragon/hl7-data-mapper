import {
  MAPPING_SUMMARY_CSV_COLUMNS,
  REVIEW_DECISION_REASON_LABELS,
  type ReportReviewDecision,
} from "@hl7-data-mapper/contracts"

import type { MappingSummaryRow } from "./types.js"

export function buildMappingSummaryRows(
  decisions: readonly ReportReviewDecision[],
): readonly MappingSummaryRow[] {
  return decisions.map((decision) => ({
    section: decision.normalizedPath.split(".")[0] ?? decision.normalizedPath,
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

export function buildMappingSummaryCsv(
  rows: readonly MappingSummaryRow[],
): string {
  return [
    MAPPING_SUMMARY_CSV_COLUMNS.join(","),
    ...rows.map((row) =>
      MAPPING_SUMMARY_CSV_COLUMNS.map((column) =>
        escapeCsvCell(row[column]),
      ).join(","),
    ),
  ].join("\n")
}

export function escapeCsvCell(value: string): string {
  const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  if (!/[",\n\r]/.test(safeValue)) return safeValue
  return `"${safeValue.replaceAll('"', '""')}"`
}
