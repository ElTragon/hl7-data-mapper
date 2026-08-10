import type { Coverage, Guarantor } from "@hl7-data-mapper/contracts"

import {
  firstComponent,
  mapAddressField,
  mapCodedValue,
  mapIdentifier,
  mapPersonNameField,
  mapTelecomField,
  parsePositiveInteger,
  stringOrNull,
} from "./hl7-datatypes.js"
import { normalizeDate } from "./temporal.js"

export function mapCoverageArrayFromSourceValues(
  inputValues: readonly unknown[],
): Coverage[] {
  if (!inputValues.some((value) => stringOrNull(value) !== null)) {
    return []
  }

  return [
    {
      sequence: parsePositiveInteger(stringOrNull(inputValues[0])) ?? 1,
      plan: mapCodedValue(stringOrNull(inputValues[1])) ?? {
        code: "",
        display: null,
        system: null,
      },
      insurer: {
        id: firstComponent(stringOrNull(inputValues[2])),
        name: firstComponent(stringOrNull(inputValues[3])),
      },
      groupNumber: stringOrNull(inputValues[4]),
      policyNumber: stringOrNull(inputValues[7]),
      subscriber: {
        name: mapPersonNameField(stringOrNull(inputValues[5])),
        relationship: mapCodedValue(stringOrNull(inputValues[6])),
      },
    },
  ]
}

export function mapGuarantorFromSourceValues(
  inputValues: readonly unknown[],
): Guarantor | null {
  if (!inputValues.some((value) => stringOrNull(value) !== null)) {
    return null
  }

  return {
    identifier: mapIdentifier(stringOrNull(inputValues[0])),
    name: mapPersonNameField(stringOrNull(inputValues[1])),
    address: mapAddressField(stringOrNull(inputValues[2])),
    telecom: mapTelecomField(stringOrNull(inputValues[3])),
    dateOfBirth: normalizeDate(stringOrNull(inputValues[4])),
    administrativeSex: stringOrNull(inputValues[5]),
    type: stringOrNull(inputValues[6]),
    relationship: mapCodedValue(stringOrNull(inputValues[7])),
  }
}
