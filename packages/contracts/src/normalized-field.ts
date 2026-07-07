import { z } from "zod"

import { ReviewStatusSchema } from "./review-status.js"
import { SourceReferenceSchema } from "./source-reference.js"

export const NormalizedFieldSchema = <ValueSchema extends z.ZodType>(
  valueSchema: ValueSchema,
) =>
  z.object({
    value: valueSchema,
    source: SourceReferenceSchema.nullable(),
    reviewStatus: ReviewStatusSchema.default("unreviewed"),
    warnings: z.array(z.string()).default([]),
  })

export type NormalizedField<Value> = {
  readonly value: Value
  readonly source: z.infer<typeof SourceReferenceSchema> | null
  readonly reviewStatus: z.infer<typeof ReviewStatusSchema>
  readonly warnings: readonly string[]
}
