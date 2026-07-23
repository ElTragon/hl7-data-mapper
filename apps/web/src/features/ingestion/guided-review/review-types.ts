import type {
  ReviewDecisionReason,
  ReviewableField,
  SourceReference,
} from "@hl7-data-mapper/contracts"
import type { PersonNameSourceRole } from "@hl7-data-mapper/mapping-engine"

export type EditableReviewStatus =
  "incorrect" | "mapping_changed" | "unavailable"

export type ReviewDecisionDetails = {
  readonly reasonCode: ReviewDecisionReason | null
  readonly reviewNote: string | null
}

export type ReviewDecisionEditorState = {
  readonly fieldId: string
  readonly status: EditableReviewStatus
}

export type ApplyReviewSource = (
  field: ReviewableField,
  source: SourceReference,
  sourceRole?: PersonNameSourceRole,
) => void
