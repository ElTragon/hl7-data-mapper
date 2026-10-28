import type { Hl7Item, SourceReference } from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import type { MappingExecutionTraceEntry } from "./types.js"

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
  return {
    segment: source.segment,
    occurrence: segments.indexOf(segment),
    segmentCount: segments.length,
    field: source.field,
    repetition: source.repetition ?? null,
    repetitionCount: field?.repetitions.length ?? 0,
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
  return segment.index
}
