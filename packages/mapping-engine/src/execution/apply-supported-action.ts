import type { Hl7Item } from "@hl7-data-mapper/contracts"

import type { Hl7SourceRead } from "../source-lookup.js"
import {
  mapCoverageArrayFromSourceValues,
  mapGuarantorFromSourceValues,
} from "./transforms/coverage.js"
import { mapLabOrderArrayFromSourceValues } from "./transforms/order.js"
import {
  mapAddressArrayFromSourceValues,
  mapPersonNameFromSourceValues,
  mapPreferredIdentifierFromSourceReads,
  mapTelecomArrayFromSourceValues,
} from "./transforms/patient.js"
import { normalizeDate, normalizeTimestamp } from "./transforms/temporal.js"
import { isMissingValue } from "./value-presence.js"

export function applySupportedAction(
  item: Hl7Item,
  inputValues: readonly unknown[],
  sourceReads: readonly Hl7SourceRead[],
): unknown {
  const firstValue = inputValues[0]

  if (item.transform?.name === "preferIdentifierType") {
    return mapPreferredIdentifierFromSourceReads(item, sourceReads)
  }

  if (item.transform?.name === "mapXpnName") {
    return mapPersonNameFromSourceValues(item, inputValues)
  }

  if (item.transform?.name === "mapRepeatingXadAddresses") {
    return mapAddressArrayFromSourceValues(inputValues)
  }

  if (item.transform?.name === "mapRepeatingXtnTelecom") {
    return mapTelecomArrayFromSourceValues(inputValues)
  }

  if (item.transform?.name === "mapRepeatingIn1Coverage") {
    return mapCoverageArrayFromSourceValues(inputValues)
  }

  if (item.transform?.name === "mapOptionalGt1Guarantor") {
    return mapGuarantorFromSourceValues(inputValues)
  }

  if (item.transform?.name === "mapOrcOrderGroups") {
    return mapLabOrderArrayFromSourceValues(inputValues)
  }

  if (item.action === "default_value") {
    return item.defaultValue ?? null
  }

  if (item.action === "normalize_date") {
    return normalizeDate(firstValue)
  }

  if (item.action === "normalize_timestamp") {
    return normalizeTimestamp(firstValue)
  }

  if (item.action === "join") {
    return inputValues.filter((value) => !isMissingValue(value)).join("")
  }

  if (item.action === "extract" || item.action === "validate") {
    return inputValues.length <= 1 ? (firstValue ?? null) : inputValues
  }

  return firstValue ?? null
}
