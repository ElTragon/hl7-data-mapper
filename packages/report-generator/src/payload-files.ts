import {
  buildMappingSummaryCsv,
  buildMappingSummaryRows,
} from "./mapping-summary.js"
import { buildMarkdownReport } from "./markdown-report.js"
import { toPrettyJson } from "./serialization.js"
import type { BuildReportPackageInput, ReportPayloadFile } from "./types.js"

export function buildPayloadFiles(
  input: BuildReportPackageInput,
): readonly ReportPayloadFile[] {
  const rows = buildMappingSummaryRows(input.reviewDecisions)
  const requiredFiles: ReportPayloadFile[] = [
    {
      fileName: "REPORT.md",
      mediaType: "text/markdown",
      content: buildMarkdownReport(input, rows),
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
      content: buildMappingSummaryCsv(rows),
    },
  ]
  if (input.sourcePolicy !== "synthetic_source_included") return requiredFiles
  return [
    ...requiredFiles,
    {
      fileName: "source.hl7",
      mediaType: "text/plain",
      content: input.syntheticSourceText ?? "",
    },
  ]
}
