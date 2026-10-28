import { z } from "zod"
import { NormalizedOutputSchema } from "./normalized-output.js"

/** Resolve target types from the contract, including absent nullable objects. */
export function normalizedPathKind(
  path: string,
): "string" | "number" | "object" | "array" | "unknown" {
  function unwrap(schema: z.ZodType): z.ZodType {
    if (
      schema instanceof z.ZodNullable ||
      schema instanceof z.ZodOptional ||
      schema instanceof z.ZodDefault
    )
      return unwrap(schema.unwrap() as z.ZodType)
    return schema
  }
  let schema: z.ZodType = NormalizedOutputSchema
  for (const key of path.replace(/\[(\d+)\]/g, ".$1").split(".")) {
    schema = unwrap(schema)
    const next =
      schema instanceof z.ZodObject
        ? schema.shape[key]
        : schema instanceof z.ZodArray && /^\d+$/.test(key)
          ? schema.element
          : undefined
    if (!next) return "unknown"
    schema = next as z.ZodType
  }
  schema = unwrap(schema)
  if (schema instanceof z.ZodString) return "string"
  if (schema instanceof z.ZodNumber) return "number"
  if (schema instanceof z.ZodObject) return "object"
  if (schema instanceof z.ZodArray) return "array"
  return "unknown"
}
