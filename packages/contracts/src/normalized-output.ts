import { z } from "zod"

import {
  AddressSchema,
  CodedValueSchema,
  EntityIdentifierSchema,
  IdentifierSchema,
  NullableStringSchema,
  PersonNameSchema,
  ProviderSchema,
  TelecomSchema,
} from "./common.js"
import { ValidationSummarySchema } from "./validation.js"

export const NORMALIZED_OUTPUT_SCHEMA_VERSION = "1.0.0" as const

export const NormalizedOutputSectionSchema = z.enum([
  "patient",
  "sender",
  "coverage",
  "guarantor",
  "labOrders",
  "exceptions",
])

export const MessageMetadataSchema = z.object({
  type: z.literal("OML"),
  triggerEvent: z.literal("O21"),
  structure: z.literal("OML_O21"),
  controlId: z.string().nullable(),
  processingId: z.string().nullable(),
  version: z.literal("2.5.1"),
  sentAt: z.string().nullable(),
})

export const SenderEndpointSchema = z.object({
  namespaceId: z.string().nullable(),
})

export const SenderSchema = z.object({
  application: SenderEndpointSchema,
  facility: SenderEndpointSchema,
  receivingApplication: SenderEndpointSchema,
  receivingFacility: SenderEndpointSchema,
})

export const PatientSchema = z.object({
  identifiers: z.array(IdentifierSchema),
  name: PersonNameSchema,
  dateOfBirth: NullableStringSchema,
  administrativeSex: NullableStringSchema,
  addresses: z.array(AddressSchema).default([]),
  telecom: z.array(TelecomSchema).default([]),
})

export const SubscriberSchema = z.object({
  name: PersonNameSchema,
  relationship: CodedValueSchema.nullable(),
})

export const CoverageSchema = z.object({
  sequence: z.number().int().positive(),
  plan: CodedValueSchema,
  insurer: z.object({
    id: z.string().nullable(),
    name: z.string().nullable(),
  }),
  groupNumber: NullableStringSchema,
  policyNumber: NullableStringSchema,
  subscriber: SubscriberSchema,
})

export const GuarantorSchema = z.object({
  identifier: IdentifierSchema.nullable(),
  name: PersonNameSchema,
  address: AddressSchema.nullable(),
  telecom: TelecomSchema.nullable(),
  dateOfBirth: NullableStringSchema,
  administrativeSex: NullableStringSchema,
  type: NullableStringSchema,
  relationship: CodedValueSchema.nullable(),
})

export const OrderTimingSchema = z.object({
  startAt: NullableStringSchema,
  endAt: NullableStringSchema,
  priority: CodedValueSchema.nullable(),
})

export const SpecimenSchema = z.object({
  sequence: z.number().int().positive(),
  placerId: EntityIdentifierSchema.nullable(),
  fillerId: EntityIdentifierSchema.nullable(),
  type: CodedValueSchema.nullable(),
  role: CodedValueSchema.nullable(),
  collected: z.object({
    startAt: NullableStringSchema,
    endAt: NullableStringSchema,
  }),
  receivedAt: NullableStringSchema,
  containerType: CodedValueSchema.nullable(),
})

export const LabOrderSchema = z.object({
  controlCode: NullableStringSchema,
  placerOrderNumber: EntityIdentifierSchema.nullable(),
  fillerOrderNumber: EntityIdentifierSchema.nullable(),
  status: NullableStringSchema,
  transactionAt: NullableStringSchema,
  orderingProvider: ProviderSchema.nullable(),
  timing: OrderTimingSchema,
  service: CodedValueSchema,
  specimens: z.array(SpecimenSchema).default([]),
})

export const NormalizedOutputSchema = z.object({
  schemaVersion: z.literal(NORMALIZED_OUTPUT_SCHEMA_VERSION),
  clientId: NullableStringSchema.optional(),
  generatedAt: NullableStringSchema.optional(),
  message: MessageMetadataSchema,
  sender: SenderSchema,
  patient: PatientSchema,
  coverages: z.array(CoverageSchema).default([]),
  guarantor: GuarantorSchema.nullable(),
  labOrders: z.array(LabOrderSchema).default([]),
  validation: ValidationSummarySchema.optional(),
})

export type MessageMetadata = z.infer<typeof MessageMetadataSchema>
export type NormalizedOutputSection = z.infer<
  typeof NormalizedOutputSectionSchema
>
export type SenderEndpoint = z.infer<typeof SenderEndpointSchema>
export type Sender = z.infer<typeof SenderSchema>
export type Patient = z.infer<typeof PatientSchema>
export type Subscriber = z.infer<typeof SubscriberSchema>
export type Coverage = z.infer<typeof CoverageSchema>
export type Guarantor = z.infer<typeof GuarantorSchema>
export type OrderTiming = z.infer<typeof OrderTimingSchema>
export type Specimen = z.infer<typeof SpecimenSchema>
export type LabOrder = z.infer<typeof LabOrderSchema>
export type NormalizedOutput = z.infer<typeof NormalizedOutputSchema>
