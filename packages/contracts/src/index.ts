export const contractsPackage = {
  name: "@hl7-data-mapper/contracts",
  responsibility:
    "Shared schemas and TypeScript types for normalized HL7 extraction data.",
} as const

export type ContractsPackage = typeof contractsPackage

export {
  AddressSchema,
  CodedValueSchema,
  EntityIdentifierSchema,
  IdentifierSchema,
  NullableStringSchema,
  PersonNameSchema,
  ProviderSchema,
  TelecomSchema,
} from "./common.js"
export type {
  Address,
  CodedValue,
  EntityIdentifier,
  Identifier,
  PersonName,
  Provider,
  Telecom,
} from "./common.js"

export {
  archivePublishedClientProfile,
  canEditClientProfile,
  canExecuteClientProfile,
  ClientProfileSchema,
  ClientProfileStatusSchema,
  createDraftClientProfileVersion,
  publishDraftClientProfile,
} from "./client-profile.js"
export type {
  ClientProfile,
  ClientProfileStatus,
  CreateDraftProfileVersionInput,
} from "./client-profile.js"

export {
  GUIDED_REVIEW_STEPS,
  GuidedReviewProgressSchema,
  GuidedReviewStepIdSchema,
  GuidedReviewStepSchema,
  ReviewableFieldSchema,
  ReviewCorrectionIntentSchema,
  ReviewSourceCandidateSchema,
} from "./guided-review.js"
export type {
  GuidedReviewProgress,
  GuidedReviewStep,
  GuidedReviewStepId,
  ReviewableField,
  ReviewCorrectionIntent,
  ReviewSourceCandidate,
} from "./guided-review.js"

export {
  Hl7ItemActionSchema,
  Hl7ItemSchema,
  Hl7ItemSetSchema,
  Hl7ItemTransformSchema,
  Hl7ItemValueTypeSchema,
  SourceExpectationRequirednessSchema,
  SourceExpectationSchema,
  sortHl7ItemsForExecution,
} from "./hl7-item.js"
export type {
  Hl7Item,
  Hl7ItemAction,
  Hl7ItemSet,
  Hl7ItemTransform,
  Hl7ItemValueType,
  SourceExpectation,
  SourceExpectationRequiredness,
} from "./hl7-item.js"

export {
  NormalizedFieldSchema,
  TransformStepSchema,
} from "./normalized-field.js"
export type { NormalizedField, TransformStep } from "./normalized-field.js"

export {
  AuditActorTypeSchema,
  AuditEventRecordSchema,
  AuditEventSchema,
  AuditEventTypeSchema,
  ClientRecordSchema,
  ClientRecordStatusSchema,
  createEmptyDemoBrowserStorageSnapshot,
  DemoBrowserStorageSnapshotSchema,
  DemoPersistencePolicySchema,
  DemoStorageCorrectionIntentSchema,
  DemoStorageReviewDecisionSchema,
  Hl7ItemRecordSchema,
  isSafeAuditMetadata,
  MappingProfileRecordSchema,
  MappingRunMetadataSchema,
  MappingRunStatusSchema,
  MappingVersionRecordSchema,
  MessageHashSchema,
  resetDemoBrowserStorageSnapshot,
  SafeAuditMetadataSchema,
} from "./persistence.js"
export type {
  AuditActorType,
  AuditEvent,
  AuditEventRecord,
  AuditEventType,
  ClientRecord,
  ClientRecordStatus,
  DemoBrowserStorageSnapshot,
  DemoPersistencePolicy,
  DemoStorageCorrectionIntent,
  DemoStorageReviewDecision,
  Hl7ItemRecord,
  MappingProfileRecord,
  MappingRunMetadata,
  MappingRunStatus,
  MappingVersionRecord,
  MessageHash,
  SafeAuditMetadata,
} from "./persistence.js"

export {
  CoverageSchema,
  GuarantorSchema,
  LabOrderSchema,
  MessageMetadataSchema,
  NORMALIZED_OUTPUT_SCHEMA_VERSION,
  NormalizedOutputSectionSchema,
  NormalizedOutputSchema,
  OrderTimingSchema,
  PatientSchema,
  SenderEndpointSchema,
  SenderSchema,
  SpecimenSchema,
  SubscriberSchema,
} from "./normalized-output.js"
export type {
  Coverage,
  Guarantor,
  LabOrder,
  MessageMetadata,
  NormalizedOutput,
  NormalizedOutputSection,
  OrderTiming,
  Patient,
  Sender,
  SenderEndpoint,
  Specimen,
  Subscriber,
} from "./normalized-output.js"

export {
  HASHED_REPORT_FILE_NAMES,
  MAPPING_SUMMARY_CSV_COLUMNS,
  MappingSummaryCsvColumnSchema,
  OPTIONAL_REPORT_FILE_NAMES,
  REPORT_CONTRACT_SCHEMA_VERSION,
  REPORT_FILE_NAMES,
  REPORT_PAYLOAD_FILE_NAMES,
  REQUIRED_REPORT_FILE_NAMES,
  ReportFileManifestEntrySchema,
  ReportFileNameSchema,
  ReportGenerationStatusSchema,
  ReportManifestSchema,
  ReportPackagePlanSchema,
  ReportPayloadFileNameSchema,
  ReportReviewDecisionSchema,
  ReportSourcePolicySchema,
} from "./report.js"
export type {
  MappingSummaryCsvColumn,
  ReportFileManifestEntry,
  ReportFileName,
  ReportGenerationStatus,
  ReportManifest,
  ReportPackagePlan,
  ReportPayloadFileName,
  ReportReviewDecision,
  ReportSourcePolicy,
} from "./report.js"

export {
  REVIEW_DECISION_REASON_LABELS,
  REVIEW_DECISION_REASONS,
  ReviewDecisionReasonSchema,
  ReviewNoteSchema,
} from "./review-decision.js"
export type { ReviewDecisionReason } from "./review-decision.js"

export {
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  ReviewStatusSchema,
} from "./review-status.js"
export type { ReviewStatus } from "./review-status.js"

export {
  buildSourcePath,
  createSourceReference,
  SourceReferenceInputSchema,
  SourceReferenceSchema,
} from "./source-reference.js"
export type {
  SourceReference,
  SourceReferenceInput,
} from "./source-reference.js"

export {
  createValidationSummary,
  hasBlockingValidationErrors,
  ValidationIssueSchema,
  ValidationSeveritySchema,
  ValidationSummarySchema,
} from "./validation.js"
export type {
  ValidationIssue,
  ValidationSeverity,
  ValidationSummary,
} from "./validation.js"
