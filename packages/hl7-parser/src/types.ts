export type Hl7Severity = "error" | "warning"

export type Hl7IssueCode =
  "empty_message" | "missing_msh" | "invalid_msh" | "malformed_segment_name"

export interface Hl7Issue {
  readonly code: Hl7IssueCode
  readonly severity: Hl7Severity
  readonly message: string
  readonly segmentIndex?: number
  readonly segmentName?: string
}

export interface Hl7Delimiters {
  readonly field: string
  readonly component: string
  readonly repetition: string
  readonly escape: string
  readonly subcomponent: string
}

export interface Hl7Component {
  readonly value: string
  readonly subComponents: readonly string[]
}

export interface Hl7Repetition {
  readonly value: string
  readonly components: readonly Hl7Component[]
}

export interface Hl7Field {
  readonly path: string
  readonly index: number
  readonly raw: string
  readonly repetitions: readonly Hl7Repetition[]
}

export interface Hl7Segment {
  readonly name: string
  readonly index: number
  readonly raw: string
  readonly fields: readonly Hl7Field[]
}

export interface Hl7MessageType {
  readonly code: string | null
  readonly triggerEvent: string | null
  readonly structure: string | null
  readonly raw: string | null
}

export interface ParsedHl7Message {
  readonly rawText: string
  readonly normalizedText: string
  readonly delimiters: Hl7Delimiters
  readonly messageType: Hl7MessageType
  readonly version: string | null
  readonly segments: readonly Hl7Segment[]
  readonly errors: readonly Hl7Issue[]
  readonly warnings: readonly Hl7Issue[]
}
