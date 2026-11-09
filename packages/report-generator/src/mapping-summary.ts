import {
  MAPPING_SUMMARY_CSV_COLUMNS,
  REVIEW_DECISION_REASON_LABELS,
  type Hl7Item,
  type ReportReviewDecision,
  type SourceReference,
} from "@hl7-data-mapper/contracts"

import type { MappingSummaryRow } from "./types.js"

export function buildMappingSummaryRows(
  decisions: readonly ReportReviewDecision[],
  hl7Items: readonly Hl7Item[] = [],
): readonly MappingSummaryRow[] {
  const mappingItemsById = new Map(hl7Items.map((item) => [item.id, item]))

  return decisions.map((decision) => {
    const mappingItem = decision.hl7ItemId
      ? mappingItemsById.get(decision.hl7ItemId)
      : undefined
    const directMappingItem =
      mappingItem?.targetPath === decision.normalizedPath
        ? mappingItem
        : undefined
    const sourceReferences =
      directMappingItem?.sources ?? decision.sourceReferences
    const sourcePath = directMappingItem
      ? (directMappingItem.sources[0]?.path ?? "")
      : (decision.sourcePath ?? "")
    const sourceLocations = sourceReferences
      ? sourceReferences.map(formatSourceReference).join("; ")
      : sourcePath
    const joinDescription =
      directMappingItem?.action === "join" &&
      directMappingItem.sources.length > 1
        ? `; join with ${JSON.stringify(directMappingItem.joinSeparator ?? "")}`
        : ""

    return {
      section: decision.normalizedPath.split(".")[0] ?? decision.normalizedPath,
      targetPath: decision.normalizedPath,
      valueStatus: decision.correctionApplied
        ? "mapping_changed"
        : decision.reviewStatus,
      sourcePath,
      hl7ItemId: decision.hl7ItemId ?? "",
      reviewStatus: decision.reviewStatus,
      transformApplied: decision.correctionApplied ? "source_replaced" : "",
      reviewReason: decision.reasonCode
        ? REVIEW_DECISION_REASON_LABELS[decision.reasonCode]
        : "",
      reviewNote: decision.reviewNote ?? "",
      sourceDetails: `${sourceLocations}${joinDescription}`,
    }
  })
}

function formatSourceReference(sourceReference: SourceReference): string {
  const segmentWithMessageRow =
    sourceReference.segmentIndex === undefined ||
    sourceReference.segmentIndex === null
      ? sourceReference.segment
      : `${sourceReference.segment}(row ${sourceReference.segmentIndex + 1})`
  const hl7FieldPath = sourceReference.path.startsWith(
    `${sourceReference.segment}-`,
  )
    ? sourceReference.path.slice(sourceReference.segment.length + 1)
    : sourceReference.path
  const sourceLocation = `${segmentWithMessageRow} × ${hl7FieldPath}`

  if (!sourceReference.literalSplit) return sourceLocation

  const { separator, partNumber } = sourceReference.literalSplit
  return `${sourceLocation} split on ${JSON.stringify(separator)}, part ${partNumber}`
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
