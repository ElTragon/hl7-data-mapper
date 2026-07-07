import { z } from "zod"

import { ReviewStatusSchema } from "./review-status.js"
import { SourceReferenceSchema } from "./source-reference.js"
import { ValidationIssueSchema } from "./validation.js"

export const TransformStepSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
})

export const NormalizedFieldSchema = <ValueSchema extends z.ZodType>(
  valueSchema: ValueSchema,
) =>
  z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    value: valueSchema,
    sources: z.array(SourceReferenceSchema).default([]),
    primarySource: SourceReferenceSchema.nullable().optional(),
    transformHistory: z.array(TransformStepSchema).default([]),
    validation: z.array(ValidationIssueSchema).default([]),
    reviewStatus: ReviewStatusSchema.default("unreviewed"),
    warnings: z.array(z.string()).default([]),
  })

export type TransformStep = z.infer<typeof TransformStepSchema>

export type NormalizedField<Value> = {
  readonly key: string
  readonly label: string
  readonly value: Value
  readonly sources: readonly z.infer<typeof SourceReferenceSchema>[]
  readonly primarySource?: z.infer<typeof SourceReferenceSchema> | null
  readonly transformHistory: readonly TransformStep[]
  readonly validation: readonly z.infer<typeof ValidationIssueSchema>[]
  readonly reviewStatus: z.infer<typeof ReviewStatusSchema>
  readonly warnings: readonly string[]
}
