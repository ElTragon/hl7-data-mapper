import type {
  Address,
  Hl7Item,
  Identifier,
  PersonName,
  SourceReference,
  Telecom,
} from "@hl7-data-mapper/contracts"

import type { Hl7SourceRead } from "../../source-lookup.js"
import {
  hasAnyObjectValue,
  mapIdentifier,
  stringOrNull,
} from "./hl7-datatypes.js"

export function mapPreferredIdentifierFromSourceReads(
  item: Hl7Item,
  sourceReads: readonly Hl7SourceRead[],
): Identifier | null {
  const preferredType = stringOrNull(item.transform?.params["preferredType"])
  const identifierFields = sourceReads
    .map((sourceRead) => sourceRead.rawField ?? sourceRead.value)
    .filter((value): value is string => stringOrNull(value) !== null)

  const identifiers = identifierFields.flatMap((fieldValue) =>
    fieldValue
      .split("~")
      .map((repetition) => mapIdentifier(stringOrNull(repetition)))
      .filter((identifier): identifier is Identifier => identifier !== null),
  )

  if (identifiers.length === 0) {
    return null
  }

  return (
    identifiers.find((identifier) => identifier.type === preferredType) ??
    identifiers[0] ??
    null
  )
}

export function mapPersonNameFromSourceValues(
  item: Hl7Item,
  inputValues: readonly unknown[],
): PersonName {
  const nameParts: PersonName = {
    family: null,
    given: null,
    middle: null,
    suffix: null,
    prefix: null,
  }

  item.sources.forEach((source, index) => {
    const role = getPersonNameSourceRole(item, source, index)
    const value = stringOrNull(inputValues[index])

    if (role && value !== null) {
      nameParts[role] = value
    }
  })

  return nameParts
}

export function mapAddressArrayFromSourceValues(
  inputValues: readonly unknown[],
): Address[] {
  const address: Address = {
    street: stringOrNull(inputValues[0]),
    city: stringOrNull(inputValues[1]),
    state: stringOrNull(inputValues[2]),
    postalCode: stringOrNull(inputValues[3]),
    country: stringOrNull(inputValues[4]),
  }

  return hasAnyObjectValue(address) ? [address] : []
}

export function mapTelecomArrayFromSourceValues(
  inputValues: readonly unknown[],
): Telecom[] {
  const telecom: Telecom = {
    use: stringOrNull(inputValues[0]),
    equipmentType: stringOrNull(inputValues[1]),
    countryCode: stringOrNull(inputValues[2]),
    areaCode: stringOrNull(inputValues[3]),
    localNumber: stringOrNull(inputValues[4]),
  }

  return hasAnyObjectValue(telecom) ? [telecom] : []
}

type PersonNameSourceRole = keyof PersonName

const DEFAULT_PERSON_NAME_SOURCE_ROLES: readonly PersonNameSourceRole[] = [
  "family",
  "given",
  "middle",
  "suffix",
  "prefix",
]

function getPersonNameSourceRole(
  item: Hl7Item,
  source: SourceReference,
  sourceIndex: number,
): PersonNameSourceRole | null {
  const configuredRoles = item.transform?.params["sourceRoles"]

  if (Array.isArray(configuredRoles)) {
    const configuredRole = configuredRoles.find(
      (entry) =>
        isSourceRoleEntry(entry) &&
        entry.path === source.path &&
        (entry.segmentIndex ?? null) === (source.segmentIndex ?? null),
    )

    if (configuredRole) {
      return configuredRole.role
    }
  }

  return DEFAULT_PERSON_NAME_SOURCE_ROLES[sourceIndex] ?? null
}

function isSourceRoleEntry(value: unknown): value is {
  readonly path: string
  readonly segmentIndex?: number | null
  readonly role: PersonNameSourceRole
} {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as {
    readonly path?: unknown
    readonly segmentIndex?: unknown
    readonly role?: unknown
  }

  return (
    typeof candidate.path === "string" &&
    (candidate.segmentIndex === undefined ||
      candidate.segmentIndex === null ||
      typeof candidate.segmentIndex === "number") &&
    isPersonNameSourceRole(candidate.role)
  )
}

function isPersonNameSourceRole(role: unknown): role is PersonNameSourceRole {
  return (
    role === "family" ||
    role === "given" ||
    role === "middle" ||
    role === "suffix" ||
    role === "prefix"
  )
}
