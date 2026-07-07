import { z } from "zod"

export const ReviewStatusSchema = z.enum([
  "unreviewed",
  "confirmed",
  "mapping_changed",
  "unavailable",
])

export type ReviewStatus = z.infer<typeof ReviewStatusSchema>
