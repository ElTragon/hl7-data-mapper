import {
  NormalizedOutputSchema,
  type ReviewableField,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"
import {
  composeDefaultNormalizedOutput,
  type MappingExecutionResult,
} from "@hl7-data-mapper/mapping-engine"

export function buildReportReviewDecisions(
  reviewFields: readonly ReviewableField[],
) {
  const updatedAt = new Date().toISOString()

  return reviewFields.map((field) => ({
    fieldId: field.id,
    normalizedPath: field.normalizedPath,
    hl7ItemId: field.hl7ItemId,
    reviewStatus: field.reviewStatus,
    sourcePath: field.primarySource?.path ?? null,
    correctionApplied: field.reviewStatus === "mapping_changed",
    reasonCode: field.reasonCode ?? null,
    reviewNote: field.reviewNote ?? null,
    updatedAt,
  }))
}

export function composeCurrentNormalizedOutput({
  parsedMessage,
  mappingResult,
}: {
  readonly parsedMessage: ParsedHl7Message
  readonly mappingResult: MappingExecutionResult
}) {
  const defaultOutput = composeDefaultNormalizedOutput(parsedMessage)

  return NormalizedOutputSchema.parse(
    mergeMappedValues(defaultOutput, mappingResult.normalizedDraft),
  )
}

function mergeMappedValues(baseValue: unknown, mappedValue: unknown): unknown {
  if (!isPlainRecord(baseValue) || !isPlainRecord(mappedValue)) {
    return mappedValue
  }

  const mergedValue: Record<string, unknown> = { ...baseValue }

  for (const [key, value] of Object.entries(mappedValue)) {
    mergedValue[key] =
      key in baseValue ? mergeMappedValues(baseValue[key], value) : value
  }

  return mergedValue
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
