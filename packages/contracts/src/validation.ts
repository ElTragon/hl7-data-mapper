import { z } from "zod"

import { SourceReferenceSchema } from "./source-reference.js"

export const ValidationSeveritySchema = z.enum(["error", "warning", "info"])

export const ValidationIssueSchema = z.object({
  code: z.string().min(1),
  severity: ValidationSeveritySchema,
  message: z.string().min(1),
  path: z.string().nullable().optional(),
  fieldKey: z.string().nullable().optional(),
  section: z.string().nullable().optional(),
  segment: z.string().nullable().optional(),
  source: SourceReferenceSchema.nullable().optional(),
})

export const ValidationSummarySchema = z.object({
  errors: z.array(ValidationIssueSchema).default([]),
  warnings: z.array(ValidationIssueSchema).default([]),
  info: z.array(ValidationIssueSchema).default([]),
})

export function createValidationSummary(
  issues: readonly ValidationIssue[],
): ValidationSummary {
  return ValidationSummarySchema.parse({
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning"),
    info: issues.filter((issue) => issue.severity === "info"),
  })
}

export function hasBlockingValidationErrors(
  summary: ValidationSummary,
): boolean {
  return summary.errors.length > 0
}

export type ValidationSeverity = z.infer<typeof ValidationSeveritySchema>
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>
export type ValidationSummary = z.infer<typeof ValidationSummarySchema>
