import { z } from "zod"

export const REVIEW_DECISION_REASONS = [
  "source_not_populated",
  "wrong_source_mapping",
  "invalid_source_value",
  "not_applicable",
  "awaiting_client_confirmation",
  "other",
] as const

export const ReviewDecisionReasonSchema = z.enum(REVIEW_DECISION_REASONS)

export const ReviewNoteSchema = z.string().trim().min(1).max(1000)

export type ReviewDecisionReason = z.infer<typeof ReviewDecisionReasonSchema>

export const REVIEW_DECISION_REASON_LABELS = {
  source_not_populated: "Source not populated",
  wrong_source_mapping: "Wrong source mapping",
  invalid_source_value: "Invalid source value",
  not_applicable: "Not applicable for this client",
  awaiting_client_confirmation: "Awaiting client confirmation",
  other: "Other",
} satisfies Record<ReviewDecisionReason, string>
