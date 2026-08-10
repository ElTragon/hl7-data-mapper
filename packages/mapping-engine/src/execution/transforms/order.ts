import type { LabOrder, Specimen } from "@hl7-data-mapper/contracts"

import {
  component,
  mapCodedValue,
  mapEntityIdentifier,
  mapEntityIdentifierFromComponent,
  mapProvider,
  parsePositiveInteger,
  stringOrNull,
} from "./hl7-datatypes.js"
import { normalizeTimestamp } from "./temporal.js"

export function mapLabOrderArrayFromSourceValues(
  inputValues: readonly unknown[],
): LabOrder[] {
  if (!inputValues.some((value) => stringOrNull(value) !== null)) {
    return []
  }

  const specimen = mapSpecimenFromSourceValues(inputValues.slice(13))

  return [
    {
      controlCode: stringOrNull(inputValues[0]),
      placerOrderNumber:
        mapEntityIdentifier(stringOrNull(inputValues[9])) ??
        mapEntityIdentifier(stringOrNull(inputValues[1])),
      fillerOrderNumber:
        mapEntityIdentifier(stringOrNull(inputValues[10])) ??
        mapEntityIdentifier(stringOrNull(inputValues[2])),
      status: stringOrNull(inputValues[3]),
      transactionAt: normalizeTimestamp(stringOrNull(inputValues[4])),
      orderingProvider:
        mapProvider(stringOrNull(inputValues[5])) ??
        mapProvider(stringOrNull(inputValues[12])),
      timing: {
        startAt: normalizeTimestamp(stringOrNull(inputValues[6])),
        endAt: normalizeTimestamp(stringOrNull(inputValues[7])),
        priority: mapCodedValue(stringOrNull(inputValues[8])),
      },
      service: mapCodedValue(stringOrNull(inputValues[11])) ?? {
        code: "",
        display: null,
        system: null,
      },
      specimens: specimen ? [specimen] : [],
    },
  ]
}

function mapSpecimenFromSourceValues(
  inputValues: readonly unknown[],
): Specimen | null {
  if (!inputValues.some((value) => stringOrNull(value) !== null)) {
    return null
  }

  const specimenId = stringOrNull(inputValues[1])
  const collected = stringOrNull(inputValues[4])

  return {
    sequence: parsePositiveInteger(stringOrNull(inputValues[0])) ?? 1,
    placerId: mapEntityIdentifierFromComponent(component(specimenId, 1)),
    fillerId: mapEntityIdentifierFromComponent(component(specimenId, 2)),
    type: mapCodedValue(stringOrNull(inputValues[2])),
    role: mapCodedValue(stringOrNull(inputValues[3])),
    collected: {
      startAt: normalizeTimestamp(component(collected, 1)),
      endAt: normalizeTimestamp(component(collected, 2)),
    },
    receivedAt: normalizeTimestamp(stringOrNull(inputValues[5])),
    containerType: mapCodedValue(stringOrNull(inputValues[6])),
  }
}
