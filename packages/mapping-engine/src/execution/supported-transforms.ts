import type { Hl7Item } from "@hl7-data-mapper/contracts"

const SUPPORTED_TRANSFORMS = new Set([
  "mustEqual",
  "preferIdentifierType",
  "mapXpnName",
  "mapRepeatingXadAddresses",
  "mapRepeatingXtnTelecom",
  "mapRepeatingIn1Coverage",
  "mapOptionalGt1Guarantor",
  "mapOrcOrderGroups",
])

export function isPendingTransform(item: Hl7Item): boolean {
  if (!item.transform) {
    return false
  }

  return !SUPPORTED_TRANSFORMS.has(item.transform.name)
}
