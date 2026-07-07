import { z } from "zod"

export const SourceReferenceSchema = z.object({
  path: z.string(),
  segment: z.string(),
  field: z.number().int().positive(),
  repetition: z.number().int().nonnegative().nullable().optional(),
  component: z.number().int().positive().nullable().optional(),
  subComponent: z.number().int().positive().nullable().optional(),
  segmentIndex: z.number().int().nonnegative().nullable().optional(),
  raw: z.string().nullable().optional(),
})

export type SourceReference = z.infer<typeof SourceReferenceSchema>
