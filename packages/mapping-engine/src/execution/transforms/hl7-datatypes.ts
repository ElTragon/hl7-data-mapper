import type { Hl7Delimiters } from "@hl7-data-mapper/hl7-parser"
import type {
  Address,
  CodedValue,
  EntityIdentifier,
  Identifier,
  PersonName,
  Provider,
  Telecom,
} from "@hl7-data-mapper/contracts"

export const STANDARD_DELIMITERS: Hl7Delimiters = {
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
}
export function createDatatypeMappers(
  delimiters: Hl7Delimiters = STANDARD_DELIMITERS,
) {
  function stringOrNull(value: unknown): string | null {
    if (typeof value !== "string") {
      return null
    }

    const trimmedValue = value.trim()
    return trimmedValue.length > 0 ? trimmedValue : null
  }

  function mapAddressField(value: string | null): Address | null {
    if (!value) {
      return null
    }

    const street = component(value, 1)

    return {
      street: subComponent(street, 1) ?? street,
      city: component(value, 3),
      state: component(value, 4),
      postalCode: component(value, 5),
      country: component(value, 6),
    }
  }

  function mapTelecomField(value: string | null): Telecom | null {
    if (!value) {
      return null
    }

    return {
      use: component(value, 2),
      equipmentType: component(value, 3),
      countryCode: component(value, 5),
      areaCode: component(value, 6),
      localNumber: component(value, 7) ?? firstComponent(value),
    }
  }

  function mapPersonNameField(value: string | null): PersonName {
    return {
      family: component(value, 1),
      given: component(value, 2),
      middle: component(value, 3),
      suffix: component(value, 4),
      prefix: component(value, 5),
    }
  }

  function mapIdentifier(value: string | null): Identifier | null {
    const identifierValue = component(value, 1)

    if (!identifierValue) {
      return null
    }

    return {
      value: identifierValue,
      assigningAuthority: component(value, 4),
      type: component(value, 5),
    }
  }

  function mapEntityIdentifier(value: string | null): EntityIdentifier | null {
    const entityValue = component(value, 1)

    if (!entityValue) {
      return null
    }

    return {
      value: entityValue,
      namespaceId: component(value, 2),
    }
  }

  function mapEntityIdentifierFromComponent(
    value: string | null,
  ): EntityIdentifier | null {
    const entityValue = subComponent(value, 1)

    if (!entityValue) {
      return null
    }

    return {
      value: entityValue,
      namespaceId: subComponent(value, 2),
    }
  }

  function mapCodedValue(value: string | null): CodedValue | null {
    const code = component(value, 1)

    if (!code) {
      return null
    }

    return {
      code,
      display: component(value, 2),
      system: component(value, 3),
    }
  }

  function mapProvider(value: string | null): Provider | null {
    if (!value) {
      return null
    }

    return {
      id: component(value, 1),
      family: component(value, 2),
      given: component(value, 3),
    }
  }

  function parsePositiveInteger(value: string | null): number | null {
    if (!value || !/^\d+$/.test(value)) {
      return null
    }

    return Number(value)
  }

  function firstComponent(value: string | null): string | null {
    return component(value, 1)
  }

  function component(value: string | null, index: number): string | null {
    return emptyToNull(value?.split(delimiters.component)[index - 1])
  }

  function subComponent(value: string | null, index: number): string | null {
    return emptyToNull(value?.split(delimiters.subcomponent)[index - 1])
  }

  function emptyToNull(value: string | undefined): string | null {
    if (value === undefined) {
      return null
    }

    const trimmedValue = value.trim()
    return trimmedValue.length > 0 ? trimmedValue : null
  }

  function hasAnyObjectValue(value: Record<string, unknown>): boolean {
    return Object.values(value).some((entry) => entry !== null && entry !== "")
  }

  return {
    stringOrNull,
    mapAddressField,
    mapTelecomField,
    mapPersonNameField,
    mapIdentifier,
    mapEntityIdentifier,
    mapEntityIdentifierFromComponent,
    mapCodedValue,
    mapProvider,
    parsePositiveInteger,
    firstComponent,
    component,
    subComponent,
    hasAnyObjectValue,
  }
}
export const {
  stringOrNull,
  mapAddressField,
  mapTelecomField,
  mapPersonNameField,
  mapIdentifier,
  mapEntityIdentifier,
  mapEntityIdentifierFromComponent,
  mapCodedValue,
  mapProvider,
  parsePositiveInteger,
  firstComponent,
  component,
  subComponent,
  hasAnyObjectValue,
} = createDatatypeMappers()
