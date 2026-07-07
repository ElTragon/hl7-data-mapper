import { z } from "zod"

import { NormalizedOutputSectionSchema } from "./normalized-output.js"
import { SourceReferenceSchema } from "./source-reference.js"

export const Hl7ItemActionSchema = z.enum([
  "extract",
  "split",
  "join",
  "map_code",
  "normalize_date",
  "normalize_timestamp",
  "default_value",
  "validate",
  "compose",
])

export const Hl7ItemValueTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "timestamp",
  "identifier",
  "coded_value",
  "person_name",
  "address",
  "telecom",
  "entity_identifier",
  "object",
  "array",
  "unknown",
])

export const Hl7ItemTransformSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
})

export const Hl7ItemSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  sequence: z.number().int().positive(),
  section: NormalizedOutputSectionSchema,
  targetPath: z.string().min(1),
  label: z.string().min(1),
  action: Hl7ItemActionSchema,
  valueType: Hl7ItemValueTypeSchema.default("string"),
  sources: z.array(SourceReferenceSchema).default([]),
  dependsOn: z.array(z.string().min(1)).default([]),
  transform: Hl7ItemTransformSchema.nullable().optional(),
  required: z.boolean().default(true),
  reviewRequired: z.boolean().default(true),
  defaultValue: z.unknown().optional(),
  notes: z.string().nullable().optional(),
})

export const Hl7ItemSetSchema = z
  .object({
    clientId: z.string().min(1),
    messageType: z.literal("OML^O21"),
    hl7Version: z.literal("2.5.1"),
    items: z.array(Hl7ItemSchema).min(1),
  })
  .superRefine(({ clientId, items }, context) => {
    const itemIds = new Set<string>()
    const sequences = new Set<number>()

    for (const item of items) {
      if (item.clientId !== clientId) {
        context.addIssue({
          code: "custom",
          message: `Item "${item.id}" does not match item set clientId "${clientId}".`,
          path: ["items"],
        })
      }

      if (itemIds.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate hl7Item id "${item.id}".`,
          path: ["items"],
        })
      }

      if (sequences.has(item.sequence)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate hl7Item sequence "${item.sequence}".`,
          path: ["items"],
        })
      }

      itemIds.add(item.id)
      sequences.add(item.sequence)
    }
  })

export type Hl7ItemAction = z.infer<typeof Hl7ItemActionSchema>
export type Hl7ItemValueType = z.infer<typeof Hl7ItemValueTypeSchema>
export type Hl7ItemTransform = z.infer<typeof Hl7ItemTransformSchema>
export type Hl7Item = z.infer<typeof Hl7ItemSchema>
export type Hl7ItemSet = z.infer<typeof Hl7ItemSetSchema>
