import { z } from "zod"

export const ValidationSeveritySchema = z.enum(["error", "warning"])

export const ValidationIssueSchema = z.object({
  code: z.string(),
  severity: ValidationSeveritySchema,
  message: z.string(),
  path: z.string().nullable().optional(),
  segment: z.string().nullable().optional(),
})

export const ValidationSummarySchema = z.object({
  errors: z.array(ValidationIssueSchema).default([]),
  warnings: z.array(ValidationIssueSchema).default([]),
})

export type ValidationSeverity = z.infer<typeof ValidationSeveritySchema>
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>
export type ValidationSummary = z.infer<typeof ValidationSummarySchema>
