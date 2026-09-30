import {
  createValidationSummary,
  stableReviewJson,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"
import type {
  ReviewableField,
  SourceExpectation,
  ValidationIssue,
} from "@hl7-data-mapper/contracts"

import type {
  MappingExecutionResult,
  MappingExecutionTraceEntry,
} from "../execute-mapping.js"

export function collectReviewValidation(
  mappingResult: MappingExecutionResult,
  parsedMessage: ParsedHl7Message,
) {
  const mappingIssues = [
    ...mappingResult.validation.errors,
    ...mappingResult.validation.warnings,
    ...mappingResult.validation.info,
  ]
  const sourceKey = (issue: ValidationIssue) =>
    stableReviewJson({
      field: issue.fieldKey,
      source: issue.source ? { ...issue.source, raw: undefined } : null,
    })
  const mappingSources = new Set(
    mappingIssues.filter((issue) => issue.source).map(sourceKey),
  )
  const sourceIssues = mappingResult.executionTrace.flatMap((entry) =>
    entry.sourceReads
      .filter((read) => read.status !== "found")
      .map((read) => ({
        ...sourceReadIssue(entry, read),
        segmentIndex: read.segmentIndex ?? undefined,
      }))
      .filter((issue) => !mappingSources.has(sourceKey(issue))),
  )
  const all: ValidationIssue[] = [
    ...parsedMessage.errors.concat(parsedMessage.warnings).map((issue) => ({
      ...issue,
      origin: "parser" as const,
      segment: issue.segmentName,
    })),
    ...mappingIssues.map((issue) => ({ ...issue, origin: "mapping" as const })),
    ...sourceIssues.map((issue) => ({
      ...issue,
      origin: "source_read" as const,
    })),
  ]
  const seen = new Set<string>()
  return createValidationSummary(
    all
      .map((issue) => {
        const id = stableReviewJson({
          origin: issue.origin,
          code: issue.code,
          fieldKey: issue.fieldKey,
          path: issue.path,
          segment: issue.segment,
          segmentIndex: issue.segmentIndex,
          source: issue.source ? { ...issue.source, raw: undefined } : null,
        })
        return { ...issue, id }
      })
      .filter((issue) => {
        const key = stableReviewJson(issue)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }),
  )
}

export function buildWarningReviewFields(
  mappingResult: MappingExecutionResult,
): ReviewableField[] {
  return [
    ...mappingResult.validation.errors,
    ...mappingResult.validation.warnings,
    ...mappingResult.validation.info,
  ].map((issue, index) => {
    const field = validationIssueToReviewableField(issue, issue.severity, index)
    if (issue.origin !== "source_read") return field
    const trace = mappingResult.executionTrace.find(
      (entry) =>
        entry.targetPath === issue.fieldKey &&
        entry.sourceReads.some(
          (read) =>
            stableReviewJson(read.source) === stableReviewJson(issue.source),
        ),
    )
    const read = trace?.sourceReads.find(
      (read) =>
        stableReviewJson(read.source) === stableReviewJson(issue.source),
    )
    return {
      ...field,
      label: `Review ${field.normalizedPath} source`,
      hl7ItemId: trace?.itemId ?? null,
      rawSegment: read?.rawSegment ?? null,
      sourceCandidates: read
        ? [
            {
              source: read.source,
              rawSegment: read.rawSegment,
              previewValue: read.value,
              reason: `Source read status: ${read.status}.`,
            },
          ]
        : [],
    }
  })
}

function validationIssueToReviewableField(
  issue: ValidationIssue,
  group: "error" | "warning" | "info",
  index: number,
): ReviewableField {
  const normalizedPath =
    issue.fieldKey ??
    issue.path ??
    `validation.${issue.id ?? `${group}.${index}`}`
  const source = issue.source ?? null

  return {
    id: issue.id
      ? `issue:${issue.id}`
      : `validation-${group}-${index}-${issue.code}`,
    stepId: "warnings",
    section: "exceptions",
    normalizedPath,
    label: validationLabel(issue),
    value: issue.message,
    hl7ItemId: null,
    primarySource: source,
    sources: source ? [source] : [],
    rawSegment: source?.raw ?? null,
    transformHistory: [],
    validation: [issue],
    warnings: issue.severity === "warning" ? [issue.message] : [],
    reviewStatus: "unreviewed",
    sourceCandidates: [],
  }
}

function validationLabel(issue: ValidationIssue): string {
  if (issue.fieldKey) return `Review ${issue.fieldKey}`
  if (issue.segment) return `Review ${issue.segment} issue`
  return "Review mapping issue"
}

function sourceReadIssue(
  trace: MappingExecutionTraceEntry,
  sourceRead: MappingExecutionTraceEntry["sourceReads"][number],
): ValidationIssue {
  const expectation = findSourceExpectation(trace, sourceRead.source.path)

  return {
    code: `source-read-${sourceRead.status}`,
    severity: sourceReadSeverity(sourceRead, expectation),
    message: sourceReadMessage(trace, sourceRead, expectation),
    fieldKey: trace.targetPath,
    section: "exceptions",
    segment: sourceRead.source.segment,
    source: sourceRead.source,
  }
}

function sourceReadSeverity(
  sourceRead: MappingExecutionTraceEntry["sourceReads"][number],
  expectation: SourceExpectation | null,
): ValidationIssue["severity"] {
  return isSafeToIgnoreSource(sourceRead, expectation) ? "info" : "warning"
}

function isSafeToIgnoreSource(
  sourceRead: MappingExecutionTraceEntry["sourceReads"][number],
  expectation: SourceExpectation | null,
): boolean {
  if (
    sourceRead.status !== "empty" &&
    sourceRead.status !== "missing_component" &&
    sourceRead.status !== "missing_subcomponent"
  ) {
    return false
  }
  return expectation?.requiredness === "optional"
}

function sourceReadMessage(
  trace: MappingExecutionTraceEntry,
  sourceRead: MappingExecutionTraceEntry["sourceReads"][number],
  expectation: SourceExpectation | null,
): string {
  if (!expectation) {
    return `Source ${sourceRead.source.path} for ${trace.targetPath} returned ${sourceRead.status}.`
  }

  return [
    `Expected ${sentenceCaseLabel(expectation.expectedLabel)} at ${sourceRead.source.path}.`,
    expectation.emptyMeaning ??
      `The source returned ${sourceRead.status.replaceAll("_", " ")}.`,
    expectation.guidance,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ")
}

function sentenceCaseLabel(label: string): string {
  return `${label.slice(0, 1).toLowerCase()}${label.slice(1)}`
}

function findSourceExpectation(
  trace: MappingExecutionTraceEntry,
  sourcePath: string,
): SourceExpectation | null {
  return (
    trace.sourceExpectations?.find(
      (expectation) => expectation.path === sourcePath,
    ) ?? null
  )
}
