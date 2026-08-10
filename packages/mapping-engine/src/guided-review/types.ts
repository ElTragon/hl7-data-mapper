import type {
  ClientProfile,
  ReviewDecisionReason,
  ReviewableField,
  SourceReference,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import type { MappingExecutionResult } from "../execute-mapping.js"

export type SelectAlternateSourceInput = {
  readonly field: ReviewableField
  readonly replacementSource: SourceReference
  readonly rawSegment?: string | null
  readonly previewValue?: unknown
  readonly reason?: string | null
  readonly notes?: string
}

export type PersonNameSourceRole =
  "family" | "given" | "middle" | "suffix" | "prefix"

export type SelectCompositeFieldSourceInput = SelectAlternateSourceInput & {
  readonly profile: ClientProfile
  readonly sourceRole: PersonNameSourceRole
}

export type ApplyReviewCorrectionInput = {
  readonly profile: ClientProfile
  readonly field: ReviewableField
  readonly updatedAt: string
}

export type ApplyReviewCorrectionAndRerunInput = ApplyReviewCorrectionInput & {
  readonly parsedMessage: ParsedHl7Message
}

export type ApplyReviewCorrectionAndRerunResult = {
  readonly profile: ClientProfile
  readonly mappingResult: MappingExecutionResult
  readonly reviewFields: readonly ReviewableField[]
}

export type ReviewDecisionDetails = {
  readonly reasonCode?: ReviewDecisionReason | null
  readonly reviewNote?: string | null
}
