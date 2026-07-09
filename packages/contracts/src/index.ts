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
  sortHl7ItemsForExecution,
} from "./hl7-item.js"
export type {
  Hl7Item,
  Hl7ItemAction,
  Hl7ItemSet,
  Hl7ItemTransform,
  Hl7ItemValueType,
} from "./hl7-item.js"

export {
  NormalizedFieldSchema,
  TransformStepSchema,
} from "./normalized-field.js"
export type { NormalizedField, TransformStep } from "./normalized-field.js"

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
