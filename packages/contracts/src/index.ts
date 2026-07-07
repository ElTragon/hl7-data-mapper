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

export { NormalizedFieldSchema } from "./normalized-field.js"
export type { NormalizedField } from "./normalized-field.js"

export {
  CoverageSchema,
  GuarantorSchema,
  LabOrderSchema,
  MessageMetadataSchema,
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
  OrderTiming,
  Patient,
  Sender,
  SenderEndpoint,
  Specimen,
  Subscriber,
} from "./normalized-output.js"

export { ReviewStatusSchema } from "./review-status.js"
export type { ReviewStatus } from "./review-status.js"

export { SourceReferenceSchema } from "./source-reference.js"
export type { SourceReference } from "./source-reference.js"

export {
  ValidationIssueSchema,
  ValidationSeveritySchema,
  ValidationSummarySchema,
} from "./validation.js"
export type {
  ValidationIssue,
  ValidationSeverity,
  ValidationSummary,
} from "./validation.js"
