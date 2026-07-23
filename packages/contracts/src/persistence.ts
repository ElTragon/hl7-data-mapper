import { z } from "zod"

import { ClientProfileSchema } from "./client-profile.js"
import { Hl7ItemActionSchema, Hl7ItemValueTypeSchema } from "./hl7-item.js"
import { NormalizedOutputSectionSchema } from "./normalized-output.js"
import {
  ReviewDecisionReasonSchema,
  ReviewNoteSchema,
} from "./review-decision.js"
import { ReviewStatusSchema } from "./review-status.js"

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

const JsonStringSchema = z.string().superRefine((value, context) => {
  try {
    JSON.parse(value)
  } catch {
    context.addIssue({
      code: "custom",
      message: "Expected a valid JSON string.",
    })
  }
})

const SafeJsonStringSchema = z.string().superRefine((value, context) => {
  try {
    const parsedValue = JSON.parse(value) as unknown

    for (const issue of findUnsafeMetadataIssues(parsedValue, "json")) {
      context.addIssue({
        code: "custom",
        message: issue,
      })
    }
  } catch {
    context.addIssue({
      code: "custom",
      message: "Expected a valid JSON string.",
    })
  }
})

export const MessageHashSchema = z.string().regex(SHA_256_HEX_PATTERN)

export const ClientRecordStatusSchema = z.enum([
  "active",
  "inactive",
  "archived",
])

export const ClientRecordSchema = z
  .object({
    clientId: z.string().min(1),
    displayName: z.string().min(1),
    status: ClientRecordStatusSchema,
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict()

export const MappingProfileRecordSchema = z
  .object({
    profileId: z.string().min(1),
    clientId: z.string().min(1),
    displayName: z.string().min(1),
    description: z.string().nullable().optional(),
    hl7Version: z.literal("2.5.1"),
    messageType: z.literal("OML^O21"),
    messageStructure: z.literal("OML_O21"),
    currentPublishedVersion: z.number().int().positive().nullable().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict()

export const MappingVersionRecordSchema = z
  .object({
    profileId: z.string().min(1),
    profileVersion: z.number().int().positive(),
    status: z.enum(["draft", "published", "archived"]),
    basedOnProfileVersion: z.number().int().positive().nullable().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    publishedAt: z.string().nullable().optional(),
    archivedAt: z.string().nullable().optional(),
  })
  .strict()
  .superRefine((version, context) => {
    if (version.status === "draft") {
      if (version.publishedAt) {
        context.addIssue({
          code: "custom",
          message: "Draft mapping versions must not have publishedAt set.",
          path: ["publishedAt"],
        })
      }

      if (version.archivedAt) {
        context.addIssue({
          code: "custom",
          message: "Draft mapping versions must not have archivedAt set.",
          path: ["archivedAt"],
        })
      }
    }

    if (version.status === "published" && !version.publishedAt) {
      context.addIssue({
        code: "custom",
        message: "Published mapping versions must have publishedAt set.",
        path: ["publishedAt"],
      })
    }

    if (version.status === "archived") {
      if (!version.publishedAt) {
        context.addIssue({
          code: "custom",
          message: "Archived mapping versions must have publishedAt set.",
          path: ["publishedAt"],
        })
      }

      if (!version.archivedAt) {
        context.addIssue({
          code: "custom",
          message: "Archived mapping versions must have archivedAt set.",
          path: ["archivedAt"],
        })
      }
    }
  })

export const Hl7ItemRecordSchema = z
  .object({
    profileId: z.string().min(1),
    profileVersion: z.number().int().positive(),
    itemId: z.string().min(1),
    clientId: z.string().min(1),
    sequence: z.number().int().positive(),
    section: NormalizedOutputSectionSchema,
    targetPath: z.string().min(1),
    label: z.string().min(1),
    action: Hl7ItemActionSchema,
    valueType: Hl7ItemValueTypeSchema,
    sourcesJson: JsonStringSchema.default("[]"),
    dependsOnJson: JsonStringSchema.default("[]"),
    transformJson: JsonStringSchema.nullable().optional(),
    required: z.boolean().default(true),
    reviewRequired: z.boolean().default(true),
    defaultValueJson: SafeJsonStringSchema.nullable().optional(),
    notes: z.string().nullable().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict()

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
  "review_decision_changed",
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

export const AuditEventRecordSchema = z
  .object({
    eventId: z.string().min(1),
    eventType: AuditEventTypeSchema,
    actorType: AuditActorTypeSchema,
    actorId: z.string().min(1).nullable().optional(),
    clientId: z.string().min(1).nullable().optional(),
    profileId: z.string().min(1).nullable().optional(),
    profileVersion: z.number().int().positive().nullable().optional(),
    messageHash: MessageHashSchema.nullable().optional(),
    metadataJson: SafeJsonStringSchema.default("{}"),
    createdAt: z.string().min(1),
  })
  .strict()

export const DemoStorageReviewDecisionSchema = z
  .object({
    fieldId: z.string().min(1),
    normalizedPath: z.string().min(1),
    messageFingerprint: z
      .string()
      .regex(/^[a-f0-9]{16}$/i)
      .optional(),
    reviewStatus: ReviewStatusSchema,
    reasonCode: ReviewDecisionReasonSchema.nullable().optional(),
    reviewNote: ReviewNoteSchema.nullable().optional(),
    updatedAt: z.string().min(1),
  })
  .strict()

export const DemoStorageCorrectionIntentSchema = z
  .object({
    fieldId: z.string().min(1),
    targetHl7ItemId: z.string().min(1),
    replacementSourcePath: z.string().min(1).nullable().optional(),
    notes: z.string().nullable().optional(),
    updatedAt: z.string().min(1),
  })
  .strict()

export const DemoBrowserStorageSnapshotSchema = z
  .object({
    storageVersion: z.literal(1),
    mode: z.literal("public_demo"),
    draftProfiles: z.array(ClientProfileSchema).default([]),
    reviewDecisions: z.array(DemoStorageReviewDecisionSchema).default([]),
    correctionIntents: z.array(DemoStorageCorrectionIntentSchema).default([]),
    demoAuditEvents: z.array(AuditEventSchema).default([]),
    updatedAt: z.string().min(1),
  })
  .strict()
  .superRefine((snapshot, context) => {
    snapshot.draftProfiles.forEach((profile, index) => {
      if (profile.status !== "draft") {
        context.addIssue({
          code: "custom",
          message:
            "Public demo storage may only contain editable draft profile copies.",
          path: ["draftProfiles", index, "status"],
        })
      }
    })
  })

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

export function createEmptyDemoBrowserStorageSnapshot(
  updatedAt: string,
): DemoBrowserStorageSnapshot {
  return DemoBrowserStorageSnapshotSchema.parse({
    storageVersion: 1,
    mode: "public_demo",
    draftProfiles: [],
    reviewDecisions: [],
    correctionIntents: [],
    demoAuditEvents: [],
    updatedAt,
  })
}

export function resetDemoBrowserStorageSnapshot(
  updatedAt: string,
): DemoBrowserStorageSnapshot {
  return createEmptyDemoBrowserStorageSnapshot(updatedAt)
}

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
export type ClientRecordStatus = z.infer<typeof ClientRecordStatusSchema>
export type ClientRecord = z.infer<typeof ClientRecordSchema>
export type MappingProfileRecord = z.infer<typeof MappingProfileRecordSchema>
export type MappingVersionRecord = z.infer<typeof MappingVersionRecordSchema>
export type Hl7ItemRecord = z.infer<typeof Hl7ItemRecordSchema>
export type MappingRunStatus = z.infer<typeof MappingRunStatusSchema>
export type MappingRunMetadata = z.infer<typeof MappingRunMetadataSchema>
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>
export type AuditActorType = z.infer<typeof AuditActorTypeSchema>
export type SafeAuditMetadata = z.infer<typeof SafeAuditMetadataSchema>
export type AuditEvent = z.infer<typeof AuditEventSchema>
export type AuditEventRecord = z.infer<typeof AuditEventRecordSchema>
export type DemoStorageReviewDecision = z.infer<
  typeof DemoStorageReviewDecisionSchema
>
export type DemoStorageCorrectionIntent = z.infer<
  typeof DemoStorageCorrectionIntentSchema
>
export type DemoBrowserStorageSnapshot = z.infer<
  typeof DemoBrowserStorageSnapshotSchema
>
export type DemoPersistencePolicy = z.infer<typeof DemoPersistencePolicySchema>
