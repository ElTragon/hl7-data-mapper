import { z } from "zod"

const HL7_SEGMENT_NAME_PATTERN = /^[A-Z0-9]{3}$/
const HL7_SOURCE_PATH_PATTERN = /^[A-Z0-9]{3}-\d+(?:\[\d+\])?(?:\.\d+){0,2}$/

export const SourceReferenceSchema = z.object({
  path: z.string().regex(HL7_SOURCE_PATH_PATTERN),
  segment: z.string().regex(HL7_SEGMENT_NAME_PATTERN),
  field: z.number().int().positive(),
  repetition: z.number().int().positive().nullable().optional(),
  component: z.number().int().positive().nullable().optional(),
  subComponent: z.number().int().positive().nullable().optional(),
  segmentIndex: z.number().int().nonnegative().nullable().optional(),
  raw: z.string().nullable().optional(),
})

export const SourceReferenceInputSchema = SourceReferenceSchema.omit({
  path: true,
})

export type SourceReference = z.infer<typeof SourceReferenceSchema>
export type SourceReferenceInput = z.infer<typeof SourceReferenceInputSchema>

export function buildSourcePath({
  segment,
  field,
  repetition,
  component,
  subComponent,
}: Pick<
  SourceReference,
  "segment" | "field" | "repetition" | "component" | "subComponent"
>): string {
  const repetitionPath = repetition ? `[${repetition}]` : ""
  const componentPath = component ? `.${component}` : ""
  const subComponentPath = subComponent ? `.${subComponent}` : ""

  return `${segment}-${field}${repetitionPath}${componentPath}${subComponentPath}`
}

export function createSourceReference(
  input: SourceReferenceInput,
): SourceReference {
  const parsedInput = SourceReferenceInputSchema.parse(input)

  return SourceReferenceSchema.parse({
    ...parsedInput,
    path: buildSourcePath(parsedInput),
  })
}
