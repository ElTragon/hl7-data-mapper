import { z } from "zod"

const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/i

const UNSAFE_METADATA_KEY_PARTS = [
  "rawmessage",
  "rawhl7",
  "sourcehl7",
  "sourcemessage",
  "uploadedfile",
  "normalizedpatient",
  "normalizeddata",
  "extractedpatient",
  "patientname",
  "mrn",
  "dateofbirth",
  "dob",
  "address",
  "phone",
  "coveragevalue",
  "guarantorvalue",
  "laborderpayload",
]

const HL7_SEGMENT_LINE_PATTERN = /(?:^|\n|\r)[A-Z0-9]{3}\|/

export const MessageHashSchema = z.string().regex(SHA_256_HEX_PATTERN)

export const MappingRunStatusSchema = z.enum([
  "completed",
  "completed_with_warnings",
  "failed",
])

export const MappingRunMetadataSchema = z
  .object({
    runId: z.string().min(1),
    clientId: z.string().min(1),
    profileId: z.string().min(1),
    profileVersion: z.number().int().positive(),
    messageHash: MessageHashSchema,
    messageType: z.literal("OML^O21"),
    hl7Version: z.literal("2.5.1"),
    messageStructure: z.literal("OML_O21"),
    ranAt: z.string().min(1),
    resultStatus: MappingRunStatusSchema,
    validationErrorCount: z.number().int().nonnegative(),
    validationWarningCount: z.number().int().nonnegative(),
    validationInfoCount: z.number().int().nonnegative(),
  })
  .strict()

export const AuditEventTypeSchema = z.enum([
  "client_created",
  "profile_created",
  "draft_edited",
  "source_changed",
  "profile_published",
  "profile_archived",
  "mapping_run_completed",
  "mapping_run_failed",
])

export const AuditActorTypeSchema = z.enum([
  "system",
  "demo_user",
  "implementation_user",
])

export const SafeAuditMetadataSchema = z
  .record(z.string(), z.unknown())
  .default({})
  .superRefine((metadata, context) => {
    for (const issue of findUnsafeMetadataIssues(metadata)) {
      context.addIssue({
        code: "custom",
        message: issue,
      })
    }
  })

export const AuditEventSchema = z
  .object({
    eventId: z.string().min(1),
    eventType: AuditEventTypeSchema,
    actorType: AuditActorTypeSchema,
    actorId: z.string().min(1).nullable().optional(),
    clientId: z.string().min(1).nullable().optional(),
    profileId: z.string().min(1).nullable().optional(),
    profileVersion: z.number().int().positive().nullable().optional(),
    messageHash: MessageHashSchema.nullable().optional(),
    metadata: SafeAuditMetadataSchema,
    createdAt: z.string().min(1),
  })
  .strict()

export const DemoPersistencePolicySchema = z
  .object({
    mode: z.literal("public_demo"),
    builtInProfilesReadOnly: z.literal(true),
    recruiterChangesStorage: z.literal("browser"),
    allowPublicDatabaseWrites: z.literal(false),
    persistRawMessages: z.literal(false),
    persistExtractedPatientData: z.literal(false),
    resetClearsRecruiterChanges: z.literal(true),
  })
  .strict()

export function isSafeAuditMetadata(metadata: unknown): boolean {
  return SafeAuditMetadataSchema.safeParse(metadata).success
}

function findUnsafeMetadataIssues(value: unknown, path = "metadata"): string[] {
  const issues: string[] = []

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      issues.push(...findUnsafeMetadataIssues(item, `${path}[${index}]`))
    })

    return issues
  }

  if (typeof value === "string") {
    if (HL7_SEGMENT_LINE_PATTERN.test(value)) {
      issues.push(`${path} must not contain raw HL7 segment text.`)
    }

    return issues
  }

  if (typeof value !== "object" || value === null) {
    return issues
  }

  for (const [key, childValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "")

    if (
      UNSAFE_METADATA_KEY_PARTS.some((part) => normalizedKey.includes(part))
    ) {
      issues.push(`${path}.${key} is not safe audit metadata.`)
    }

    issues.push(...findUnsafeMetadataIssues(childValue, `${path}.${key}`))
  }

  return issues
}

export type MessageHash = z.infer<typeof MessageHashSchema>
export type MappingRunStatus = z.infer<typeof MappingRunStatusSchema>
export type MappingRunMetadata = z.infer<typeof MappingRunMetadataSchema>
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>
export type AuditActorType = z.infer<typeof AuditActorTypeSchema>
export type SafeAuditMetadata = z.infer<typeof SafeAuditMetadataSchema>
export type AuditEvent = z.infer<typeof AuditEventSchema>
export type DemoPersistencePolicy = z.infer<typeof DemoPersistencePolicySchema>
