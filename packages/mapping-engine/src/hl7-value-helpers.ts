import type {
  Address,
  CodedValue,
  EntityIdentifier,
  Identifier,
  PersonName,
  Provider,
  Telecom,
} from "@hl7-data-mapper/contracts"
import type {
  Hl7Component,
  Hl7Field,
  Hl7Repetition,
} from "@hl7-data-mapper/hl7-parser"

export function firstRepetition(
  field: Hl7Field | undefined,
): Hl7Repetition | undefined {
  return field?.repetitions.find((repetition) => hasValue(repetition.value))
}

export function firstNonEmpty(values: readonly unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

export function componentValue(
  repetition: Hl7Repetition | undefined,
  componentIndex: number,
): string | null {
  return emptyToNull(repetition?.components[componentIndex - 1]?.value)
}

export function subComponentValue(
  component: Hl7Component | undefined,
  subComponentIndex: number,
): string | null {
  return emptyToNull(component?.subComponents[subComponentIndex - 1])
}

export function mapCodedValue(
  repetition: Hl7Repetition | undefined,
): CodedValue | null {
  const code = componentValue(repetition, 1)

  if (!code) {
    return null
  }

  return {
    code,
    display: componentValue(repetition, 2),
    system: componentValue(repetition, 3),
  }
}

export function mapIdentifier(
  repetition: Hl7Repetition | undefined,
): Identifier | null {
  const value = componentValue(repetition, 1)

  if (!value) {
    return null
  }

  return {
    value,
    assigningAuthority: componentValue(repetition, 4),
    type: componentValue(repetition, 5),
  }
}

export function chooseIdentifier(
  field: Hl7Field | undefined,
  preferredType: string,
): Identifier | null {
  const preferred = field?.repetitions.find(
    (repetition) => componentValue(repetition, 5) === preferredType,
  )

  return mapIdentifier(preferred ?? firstRepetition(field))
}

export function mapEntityIdentifier(
  repetition: Hl7Repetition | undefined,
): EntityIdentifier | null {
  const value = componentValue(repetition, 1)

  if (!value) {
    return null
  }

  return {
    value,
    namespaceId: componentValue(repetition, 2),
  }
}

export function mapEntityIdentifierFromComponent(
  component: Hl7Component | undefined,
): EntityIdentifier | null {
  const value = subComponentValue(component, 1)

  if (!value) {
    return null
  }

  return {
    value,
    namespaceId: subComponentValue(component, 2),
  }
}

export function mapPersonName(
  repetition: Hl7Repetition | undefined,
): PersonName {
  return {
    family: componentValue(repetition, 1),
    given: componentValue(repetition, 2),
    middle: componentValue(repetition, 3),
    suffix: componentValue(repetition, 4),
    prefix: componentValue(repetition, 5),
  }
}

export function mapAddress(repetition: Hl7Repetition | undefined): Address {
  const streetComponent = repetition?.components[0]

  return {
    street:
      subComponentValue(streetComponent, 1) ?? componentValue(repetition, 1),
    city: componentValue(repetition, 3),
    state: componentValue(repetition, 4),
    postalCode: componentValue(repetition, 5),
    country: componentValue(repetition, 6),
  }
}

export function mapTelecom(repetition: Hl7Repetition | undefined): Telecom {
  return {
    use: componentValue(repetition, 2),
    equipmentType: componentValue(repetition, 3),
    countryCode: componentValue(repetition, 5),
    areaCode: componentValue(repetition, 6),
    localNumber: componentValue(repetition, 7),
  }
}

export function mapProvider(repetition: Hl7Repetition | undefined): Provider {
  return {
    id: componentValue(repetition, 1),
    family: componentValue(repetition, 2),
    given: componentValue(repetition, 3),
  }
}

export function parseInteger(value: string | null | undefined): number | null {
  if (!value || !/^-?\d+$/.test(value)) {
    return null
  }

  return Number(value)
}

export function normalizeHl7Date(
  value: string | null | undefined,
): string | null {
  if (!value || value.length < 8) {
    return null
  }

  const compactDate = value.slice(0, 8)

  if (!/^\d{8}$/.test(compactDate)) {
    return null
  }

  return `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`
}

export function normalizeHl7Timestamp(
  value: string | null | undefined,
): string | null {
  if (!value || value.length < 8) {
    return null
  }

  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?([+-]\d{4})?$/,
  )

  if (!match) {
    return null
  }

  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${formatOffset(match[7])}`
}

function emptyToNull(value: string | undefined): string | null {
  if (value === undefined) {
    return null
  }

  const trimmedValue = value.trim()

  return trimmedValue.length > 0 ? trimmedValue : null
}

function hasValue(value: string): boolean {
  return value.trim().length > 0
}

function formatOffset(offset: string | undefined): string {
  if (!offset) {
    return "Z"
  }

  return `${offset.slice(0, 3)}:${offset.slice(3)}`
}
