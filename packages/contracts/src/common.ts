import { z } from "zod"

export const NullableStringSchema = z.string().nullable()

export const IdentifierSchema = z.object({
  value: z.string(),
  assigningAuthority: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
})

export const EntityIdentifierSchema = z.object({
  value: z.string(),
  namespaceId: z.string().nullable().optional(),
})

export const CodedValueSchema = z.object({
  code: z.string(),
  display: z.string().nullable().optional(),
  system: z.string().nullable().optional(),
})

export const PersonNameSchema = z.object({
  family: z.string().nullable(),
  given: z.string().nullable(),
  middle: z.string().nullable().optional(),
  suffix: z.string().nullable().optional(),
  prefix: z.string().nullable().optional(),
})

export const AddressSchema = z.object({
  street: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
})

export const TelecomSchema = z.object({
  use: z.string().nullable().optional(),
  equipmentType: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
  areaCode: z.string().nullable().optional(),
  localNumber: z.string().nullable(),
})

export const ProviderSchema = z.object({
  id: z.string().nullable(),
  family: z.string().nullable(),
  given: z.string().nullable(),
})

export type Identifier = z.infer<typeof IdentifierSchema>
export type EntityIdentifier = z.infer<typeof EntityIdentifierSchema>
export type CodedValue = z.infer<typeof CodedValueSchema>
export type PersonName = z.infer<typeof PersonNameSchema>
export type Address = z.infer<typeof AddressSchema>
export type Telecom = z.infer<typeof TelecomSchema>
export type Provider = z.infer<typeof ProviderSchema>
