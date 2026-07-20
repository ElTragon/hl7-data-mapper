import { z } from "zod"

import { Hl7ItemSchema } from "./hl7-item.js"
import { MessageHashSchema } from "./persistence.js"
import {
  ReviewDecisionReasonSchema,
  ReviewNoteSchema,
} from "./review-decision.js"
import { ReviewStatusSchema } from "./review-status.js"
import { ValidationSummarySchema } from "./validation.js"

export const REPORT_CONTRACT_SCHEMA_VERSION = "1.1.0" as const

export const REQUIRED_REPORT_FILE_NAMES = [
  "REPORT.md",
  "manifest.json",
  "normalized-data.json",
  "hl7-items.json",
  "review-decisions.json",
  "validation-results.json",
  "mapping-summary.csv",
] as const

export const HASHED_REPORT_FILE_NAMES = [
  "REPORT.md",
  "normalized-data.json",
  "hl7-items.json",
  "review-decisions.json",
  "validation-results.json",
  "mapping-summary.csv",
] as const

export const OPTIONAL_REPORT_FILE_NAMES = ["source.hl7"] as const

export const REPORT_FILE_NAMES = [
  ...REQUIRED_REPORT_FILE_NAMES,
  ...OPTIONAL_REPORT_FILE_NAMES,
] as const

export const REPORT_PAYLOAD_FILE_NAMES = [
  ...HASHED_REPORT_FILE_NAMES,
  ...OPTIONAL_REPORT_FILE_NAMES,
] as const

export const ReportFileNameSchema = z.enum(REPORT_FILE_NAMES)
export const ReportPayloadFileNameSchema = z.enum(REPORT_PAYLOAD_FILE_NAMES)

export const ReportSourcePolicySchema = z.enum([
  "raw_source_excluded",
  "synthetic_source_included",
])

export const ReportGenerationStatusSchema = z.enum([
  "pending",
  "generated",
  "failed",
])

export const MappingSummaryCsvColumnSchema = z.enum([
  "section",
  "targetPath",
  "valueStatus",
  "sourcePath",
  "hl7ItemId",
  "reviewStatus",
  "transformApplied",
  "reviewReason",
  "reviewNote",
])

export const MAPPING_SUMMARY_CSV_COLUMNS = [
  "section",
  "targetPath",
  "valueStatus",
  "sourcePath",
  "hl7ItemId",
  "reviewStatus",
  "transformApplied",
  "reviewReason",
  "reviewNote",
] as const satisfies readonly MappingSummaryCsvColumn[]

export const ReportFileManifestEntrySchema = z
  .object({
    fileName: ReportPayloadFileNameSchema,
    mediaType: z.string().min(1),
    byteLength: z.number().int().nonnegative(),
    sha256: MessageHashSchema,
  })
  .strict()

export const ReportManifestSchema = z
  .object({
    schemaVersion: z.literal(REPORT_CONTRACT_SCHEMA_VERSION),
    appName: z.literal("HL7 Data Mapper"),
    appVersion: z.string().min(1),
    generatedAt: z.string().min(1),
    clientId: z.string().min(1),
    profileId: z.string().min(1),
    profileVersion: z.number().int().positive(),
    hl7Version: z.literal("2.5.1"),
    messageType: z.literal("OML^O21"),
    messageStructure: z.literal("OML_O21"),
    messageControlId: z.string().min(1).nullable().optional(),
    messageHash: MessageHashSchema,
    sourcePolicy: ReportSourcePolicySchema,
    generatedBy: z.literal("browser"),
    includedFiles: z.array(ReportFileManifestEntrySchema).min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    for (const requiredFileName of HASHED_REPORT_FILE_NAMES) {
      const matchingFiles = manifest.includedFiles.filter(
        (file) => file.fileName === requiredFileName,
      )

      if (matchingFiles.length === 0) {
        context.addIssue({
          code: "custom",
          message: `Report manifest must include ${requiredFileName}.`,
          path: ["includedFiles"],
        })
      }

      if (matchingFiles.length > 1) {
        context.addIssue({
          code: "custom",
          message: `Report manifest must include ${requiredFileName} only once.`,
          path: ["includedFiles"],
        })
      }
    }
  })

export const ReportReviewDecisionSchema = z
  .object({
    fieldId: z.string().min(1),
    normalizedPath: z.string().min(1),
    hl7ItemId: z.string().min(1).nullable().optional(),
    reviewStatus: ReviewStatusSchema,
    sourcePath: z.string().min(1).nullable().optional(),
    correctionApplied: z.boolean().default(false),
    reasonCode: ReviewDecisionReasonSchema.nullable().optional(),
    reviewNote: ReviewNoteSchema.nullable().optional(),
    updatedAt: z.string().min(1),
  })
  .strict()

export const ReportPackagePlanSchema = z
  .object({
    manifest: ReportManifestSchema,
    hl7Items: z.array(Hl7ItemSchema),
    reviewDecisions: z.array(ReportReviewDecisionSchema),
    validationResults: ValidationSummarySchema,
    mappingSummaryColumns: z
      .array(MappingSummaryCsvColumnSchema)
      .default([...MAPPING_SUMMARY_CSV_COLUMNS]),
    status: ReportGenerationStatusSchema,
  })
  .strict()

export type ReportFileName = z.infer<typeof ReportFileNameSchema>
export type ReportPayloadFileName = z.infer<typeof ReportPayloadFileNameSchema>
export type ReportSourcePolicy = z.infer<typeof ReportSourcePolicySchema>
export type ReportGenerationStatus = z.infer<
  typeof ReportGenerationStatusSchema
>
export type MappingSummaryCsvColumn = z.infer<
  typeof MappingSummaryCsvColumnSchema
>
export type ReportFileManifestEntry = z.infer<
  typeof ReportFileManifestEntrySchema
>
export type ReportManifest = z.infer<typeof ReportManifestSchema>
export type ReportReviewDecision = z.infer<typeof ReportReviewDecisionSchema>
export type ReportPackagePlan = z.infer<typeof ReportPackagePlanSchema>
