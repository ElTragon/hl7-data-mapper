import type {
  ReviewableField,
  SourceExpectation,
  ValidationIssue,
} from "@hl7-data-mapper/contracts"

import type {
  MappingExecutionResult,
  MappingExecutionTraceEntry,
} from "../execute-mapping.js"

export function buildWarningReviewFields(
  mappingResult: MappingExecutionResult,
): ReviewableField[] {
  const validationFields = [
    ...mappingResult.validation.errors.map((issue, index) =>
      validationIssueToReviewableField(issue, "error", index),
    ),
    ...mappingResult.validation.warnings.map((issue, index) =>
      validationIssueToReviewableField(issue, "warning", index),
    ),
    ...mappingResult.validation.info.map((issue, index) =>
      validationIssueToReviewableField(issue, "info", index),
    ),
  ]
  const validationSourcePaths = new Set(
    validationFields.flatMap((field) =>
      field.sources.map((source) => source.path),
    ),
  )

  return [
    ...validationFields,
    ...mappingResult.executionTrace.flatMap((entry) =>
      entry.sourceReads
        .filter((sourceRead) => sourceRead.status !== "found")
        .filter(
          (sourceRead) => !validationSourcePaths.has(sourceRead.source.path),
        )
        .map((sourceRead, index) =>
          sourceReadToReviewableField(entry, sourceRead, index),
        ),
    ),
  ]
}

function validationIssueToReviewableField(
  issue: ValidationIssue,
  group: "error" | "warning" | "info",
  index: number,
): ReviewableField {
  const normalizedPath =
    issue.fieldKey ?? issue.path ?? `validation.${group}.${index}`
  const source = issue.source ?? null

  return {
    id: `validation-${group}-${index}-${issue.code}`,
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

function sourceReadToReviewableField(
  trace: MappingExecutionTraceEntry,
  sourceRead: MappingExecutionTraceEntry["sourceReads"][number],
  index: number,
): ReviewableField {
  const issue = sourceReadIssue(trace, sourceRead)

  return {
    id: `source-read-${trace.itemId}-${index}-${sourceRead.status}`,
    stepId: "warnings",
    section: "exceptions",
    normalizedPath: trace.targetPath,
    label: `Review ${trace.targetPath} source`,
    value: issue.message,
    hl7ItemId: trace.itemId,
    primarySource: sourceRead.source,
    sources: [sourceRead.source],
    rawSegment: sourceRead.rawSegment,
    transformHistory: [],
    validation: [issue],
    warnings: issue.severity === "warning" ? [issue.message] : [],
    reviewStatus: "unreviewed",
    sourceCandidates: [
      {
        source: sourceRead.source,
        rawSegment: sourceRead.rawSegment,
        previewValue: sourceRead.value,
        reason: `Source read status: ${sourceRead.status}.`,
      },
    ],
  }
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
