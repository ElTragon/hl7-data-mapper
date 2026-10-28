import { createSourceReference, type Hl7Item } from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"
import { getOrderGroups } from "../source-lookup.js"

// Explicit coordinates remain authoritative; expand only the template sources.
export function repeatedItems(
  item: Hl7Item,
  message: ParsedHl7Message,
): Hl7Item[] {
  const name = item.transform?.name
  if (
    name === "mapRepeatingIn1Coverage" &&
    !item.sources.some((source) => source.segmentIndex != null)
  ) {
    const segments = message.segments.filter(
      (segment) => segment.name === "IN1",
    )
    return segments.length
      ? segments.map((segment) => ({
          ...item,
          sources: item.sources.map((source) => ({
            ...source,
            segmentIndex: segment.index,
          })),
        }))
      : [item]
  }
  if (
    name === "mapOrcOrderGroups" &&
    !item.sources.some((source) => source.segmentIndex != null)
  ) {
    const groups = getOrderGroups(message)
    return groups.length
      ? groups.map((group) => ({
          ...item,
          sources: item.sources.map((source) => ({
            ...source,
            segmentIndex:
              group.segments.find((segment) => segment.name === source.segment)
                ?.index ?? message.segments.length + group.orderIndex,
          })),
        }))
      : [item]
  }
  if (
    (name === "mapRepeatingXadAddresses" ||
      name === "mapRepeatingXtnTelecom") &&
    !item.sources.some((source) => source.repetition != null)
  ) {
    const first = item.sources[0]
    const segment = message.segments.find(
      (segment) =>
        segment.name === first?.segment &&
        (first.segmentIndex == null || first.segmentIndex === segment.index),
    )
    const field = segment?.fields.find((field) => field.index === first?.field)
    return field && field.repetitions.length > 1
      ? field.repetitions.map((_, index) => ({
          ...item,
          sources: item.sources.map((source) =>
            createSourceReference({
              ...source,
              repetition: index + 1,
              segmentIndex: segment!.index,
            }),
          ),
        }))
      : [item]
  }
  return [item]
}
