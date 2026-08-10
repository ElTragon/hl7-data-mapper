import type {
  ClientProfile,
  NormalizedField,
  SourceExpectation,
  SourceReference,
  ValidationIssue,
  ValidationSummary,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import type { Hl7SourceRead } from "../source-lookup.js"

export type MappingExecutionStatus =
  "completed" | "completed_with_warnings" | "error" | "pending_transform"

export type MappingExecutionTraceEntry = {
  readonly itemId: string
  readonly sequence: number
  readonly targetPath: string
  readonly status: MappingExecutionStatus
  readonly sourcesRead: readonly SourceReference[]
  readonly sourceReads: readonly Hl7SourceRead[]
  readonly sourceExpectations: readonly SourceExpectation[]
  readonly inputValues: readonly unknown[]
  readonly outputValue: unknown
  readonly validationIssues: readonly ValidationIssue[]
}

export type MappingExecutionResult = {
  readonly profile: {
    readonly clientId: string
    readonly profileId: string
    readonly profileVersion: number
    readonly status: ClientProfile["status"]
  }
  readonly normalizedDraft: Record<string, unknown>
  readonly normalizedFields: readonly NormalizedField<unknown>[]
  readonly validation: ValidationSummary
  readonly executionTrace: readonly MappingExecutionTraceEntry[]
}

export type ExecuteMappingInput = {
  readonly parsedMessage: ParsedHl7Message
  readonly profile: ClientProfile
}

export type ItemInput = {
  readonly values: readonly unknown[]
  readonly sourceReads: readonly Hl7SourceRead[]
}
