import type { Hl7Item, SourceReference } from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import type { MappingExecutionTraceEntry } from "./types.js"
import { getOrderGroups } from "../source-lookup.js"

type Anchor = NonNullable<Hl7Item["recordCorrectionIdentity"]>["replacement"]

export function sourceAnchor(
  message: ParsedHl7Message,
  source: SourceReference,
  resolvedIndex: number | null = source.segmentIndex ?? null,
): Anchor | null {
  const segments = message.segments.filter(
    (entry) => entry.name === source.segment,
  )
  const segment =
    resolvedIndex == null
      ? segments[0]
      : segments.find((entry) => entry.index === resolvedIndex)
  if (!segment) return null
  const field = segment.fields.find((entry) => entry.index === source.field)
  const group = getOrderGroups(message).find((entry) =>
    entry.segments.some((member) => member.index === segment.index),
  )
  return {
    segment: source.segment,
    occurrence: segments.indexOf(segment),
    segmentCount: segments.length,
    field: source.field,
    repetition: source.repetition ?? null,
    repetitionCount: field?.repetitions.length ?? 0,
    orderShape:
      group && (source.segment === "ORC" || source.segment === "SPM")
        ? `TQ1:${group.tq1.length},OBR:${group.obr.length},SPM:${group.spm.length}`
        : null,
  }
}

export function recordAnchors(
  message: ParsedHl7Message,
  trace: MappingExecutionTraceEntry,
  path: string,
): Anchor[] | null {
  const paths = path.match(
    /(?:patient\.identifiers|patient\.addresses|patient\.telecom|coverages|labOrders|specimens)\[\d+\]/g,
  )
  if (!paths) return null
  const anchors: Anchor[] = []
  let prefix = ""
  for (const part of paths) {
    prefix = prefix ? `${prefix}.${part}` : part
    const reads = trace.recordSources?.[prefix]
    const segment = part.startsWith("patient.identifiers")
      ? "PID"
      : part.startsWith("patient.addresses")
        ? "PID"
        : part.startsWith("patient.telecom")
          ? "PID"
          : part.startsWith("coverages")
            ? "IN1"
            : part.startsWith("labOrders")
              ? "ORC"
              : "SPM"
    const read = reads?.find(
      (entry) => entry.source.segment === segment && entry.segmentIndex != null,
    )
    if (!read) return null
    const anchor = sourceAnchor(message, read.source, read.segmentIndex)
    if (!anchor) return null
    anchors.push(anchor)
  }
  return anchors
}

export function sameAnchors(
  left: readonly Anchor[],
  right: readonly Anchor[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function fingerprintMessage(value: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  for (let index = 0; index < value.length; index++) {
    hash ^= BigInt(value.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * prime)
  }
  return hash.toString(16).padStart(16, "0")
}

export function hasIndistinguishablePeer(
  message: ParsedHl7Message,
  anchor: Anchor,
): boolean {
  if (
    anchor.segment !== "IN1" &&
    anchor.segment !== "ORC" &&
    anchor.segment !== "SPM"
  )
    return false
  return message.segments.some((segment) => {
    if (segment.name !== anchor.segment) return false
    const other = sourceAnchor(
      message,
      {
        segment: anchor.segment,
        field: anchor.field,
        path: `${anchor.segment}-${anchor.field}`,
      },
      segment.index,
    )
    return (
      other !== null &&
      other.occurrence !== anchor.occurrence &&
      other.repetitionCount === anchor.repetitionCount &&
      other.orderShape === anchor.orderShape
    )
  })
}

export function resolveAnchor(
  message: ParsedHl7Message,
  anchor: Anchor,
): number | null {
  const segments = message.segments.filter(
    (entry) => entry.name === anchor.segment,
  )
  const segment = segments[anchor.occurrence]
  if (segments.length !== anchor.segmentCount || !segment) return null
  const field = segment.fields.find((entry) => entry.index === anchor.field)
  if ((field?.repetitions.length ?? 0) !== anchor.repetitionCount) return null
  if (anchor.repetition && !field?.repetitions[anchor.repetition - 1])
    return null
  if (
    anchor.orderShape &&
    sourceAnchor(
      message,
      {
        segment: anchor.segment,
        field: anchor.field,
        path: `${anchor.segment}-${anchor.field}`,
      },
      segment.index,
    )?.orderShape !== anchor.orderShape
  )
    return null
  return segment.index
}
