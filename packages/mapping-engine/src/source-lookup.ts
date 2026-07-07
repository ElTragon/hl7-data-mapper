import type { SourceReference } from "@hl7-data-mapper/contracts"
import type { Hl7Segment, ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

export type Hl7SourceReadStatus =
  | "found"
  | "missing_segment"
  | "missing_field"
  | "missing_repetition"
  | "missing_component"
  | "missing_subcomponent"
  | "empty"

export type Hl7SourceRead = {
  readonly source: SourceReference
  readonly value: string | null
  readonly status: Hl7SourceReadStatus
  readonly segmentIndex: number | null
  readonly rawSegment: string | null
  readonly rawField: string | null
}

export type Hl7OrderGroup = {
  readonly orderIndex: number
  readonly orc: Hl7Segment
  readonly segments: readonly Hl7Segment[]
  readonly tq1: readonly Hl7Segment[]
  readonly obr: readonly Hl7Segment[]
  readonly spm: readonly Hl7Segment[]
}

export function getSegmentsByName(
  parsedMessage: ParsedHl7Message,
  segmentName: string,
): readonly Hl7Segment[] {
  return parsedMessage.segments.filter(
    (segment) => segment.name === segmentName,
  )
}

export function readSource(
  parsedMessage: ParsedHl7Message,
  source: SourceReference,
): Hl7SourceRead {
  const segment = findSegment(parsedMessage, source)

  if (!segment) {
    return createMissingRead(source, "missing_segment")
  }

  const field = segment.fields.find(
    (candidate) => candidate.index === source.field,
  )

  if (!field) {
    return createMissingRead(source, "missing_field", segment)
  }

  const repetitionIndex = (source.repetition ?? 1) - 1
  const repetition = field.repetitions[repetitionIndex]

  if (!repetition) {
    return createMissingRead(source, "missing_repetition", segment, field.raw)
  }

  if (!source.component) {
    return createFoundRead(source, repetition.value, segment, field.raw)
  }

  const component = repetition.components[source.component - 1]

  if (!component) {
    return createMissingRead(source, "missing_component", segment, field.raw)
  }

  if (!source.subComponent) {
    return createFoundRead(source, component.value, segment, field.raw)
  }

  const subComponent = component.subComponents[source.subComponent - 1]

  if (subComponent === undefined) {
    return createMissingRead(source, "missing_subcomponent", segment, field.raw)
  }

  return createFoundRead(source, subComponent, segment, field.raw)
}

export function readSourceValue(
  parsedMessage: ParsedHl7Message,
  source: SourceReference,
): string | null {
  return readSource(parsedMessage, source).value
}

export function getOrderGroups(
  parsedMessage: ParsedHl7Message,
): readonly Hl7OrderGroup[] {
  const groups: Hl7OrderGroup[] = []

  parsedMessage.segments.forEach((segment, index) => {
    if (segment.name !== "ORC") {
      return
    }

    const nextOrcIndex = parsedMessage.segments.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index && candidate.name === "ORC",
    )
    const groupEndIndex =
      nextOrcIndex === -1 ? parsedMessage.segments.length : nextOrcIndex
    const segments = parsedMessage.segments.slice(index, groupEndIndex)

    groups.push({
      orderIndex: groups.length,
      orc: segment,
      segments,
      tq1: segments.filter((candidate) => candidate.name === "TQ1"),
      obr: segments.filter((candidate) => candidate.name === "OBR"),
      spm: segments.filter((candidate) => candidate.name === "SPM"),
    })
  })

  return groups
}

function findSegment(
  parsedMessage: ParsedHl7Message,
  source: SourceReference,
): Hl7Segment | undefined {
  if (source.segmentIndex !== undefined && source.segmentIndex !== null) {
    return parsedMessage.segments.find(
      (candidate) =>
        candidate.index === source.segmentIndex &&
        candidate.name === source.segment,
    )
  }

  return parsedMessage.segments.find(
    (candidate) => candidate.name === source.segment,
  )
}

function createFoundRead(
  source: SourceReference,
  value: string,
  segment: Hl7Segment,
  rawField: string,
): Hl7SourceRead {
  const normalizedValue = emptyToNull(value)

  return {
    source,
    value: normalizedValue,
    status: normalizedValue === null ? "empty" : "found",
    segmentIndex: segment.index,
    rawSegment: segment.raw,
    rawField,
  }
}

function createMissingRead(
  source: SourceReference,
  status: Exclude<Hl7SourceReadStatus, "found" | "empty">,
  segment?: Hl7Segment,
  rawField?: string,
): Hl7SourceRead {
  return {
    source,
    value: null,
    status,
    segmentIndex: segment?.index ?? null,
    rawSegment: segment?.raw ?? null,
    rawField: rawField ?? null,
  }
}

function emptyToNull(value: string): string | null {
  return value.length > 0 ? value : null
}
