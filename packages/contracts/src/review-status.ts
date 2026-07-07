import { z } from "zod"

export const REVIEW_STATUSES = [
  "unreviewed",
  "confirmed",
  "incorrect",
  "mapping_changed",
  "unavailable",
] as const

export const ReviewStatusSchema = z.enum(REVIEW_STATUSES)

export type ReviewStatus = z.infer<typeof ReviewStatusSchema>

export const REVIEW_STATUS_LABELS = {
  unreviewed: "Needs review",
  confirmed: "Confirmed",
  incorrect: "Incorrect",
  mapping_changed: "Mapping changed",
  unavailable: "Unavailable in source",
} satisfies Record<ReviewStatus, string>
