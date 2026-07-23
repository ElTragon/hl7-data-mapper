import {
  createSourceReference,
  type SourceReference,
} from "@hl7-data-mapper/contracts"
import type {
  Hl7Component,
  Hl7Field,
  Hl7Repetition,
  Hl7Segment,
  ParsedHl7Message,
} from "@hl7-data-mapper/hl7-parser"
import { readSourceValue } from "@hl7-data-mapper/mapping-engine"

export type SourceValueShape = "scalar" | "composite" | "repeated"

export type SourceOption = {
  readonly path: string
  readonly source: SourceReference
  readonly segment: Hl7Segment
  readonly segmentOccurrence: number
  readonly orderGroup: number | null
  readonly previewValue: string
  readonly valueShape: SourceValueShape
}

export type SourceSearchResult = {
  readonly options: readonly SourceOption[]
  readonly error: string | null
}

export type SourceOptionGroup = {
  readonly segment: Hl7Segment
  readonly occurrence: number
  readonly orderGroup: number | null
  readonly options: readonly SourceOption[]
}

type ParsedSourceQuery = {
  readonly segment: string
  readonly occurrence: number | null
  readonly sourcePath: string | null
}

const SOURCE_QUERY_PATTERN =
  /^([A-Z0-9]{3})(?:\[(\d+)\])?(?:-(\d+)(?:\[(\d+)\])?(?:\.(\d+))?(?:\.(\d+))?)?$/

const ORDER_SEGMENTS = new Set(["ORC", "TQ1", "OBR", "SPM"])

export function buildSourceOptions(
  parsedMessage: ParsedHl7Message,
): SourceOption[] {
  const occurrenceCounts = new Map<string, number>()
  let currentOrderGroup = 0

  return parsedMessage.segments.flatMap((segment) => {
    if (segment.name === "ORC") {
      currentOrderGroup += 1
    }

    const occurrence = (occurrenceCounts.get(segment.name) ?? 0) + 1
    const orderGroup =
      ORDER_SEGMENTS.has(segment.name) && currentOrderGroup > 0
        ? currentOrderGroup
        : null

    occurrenceCounts.set(segment.name, occurrence)

    return segment.fields.flatMap((field) =>
      fieldToSourceOptions({
        parsedMessage,
        segment,
        segmentOccurrence: occurrence,
        orderGroup,
        field,
      }),
    )
  })
}

function fieldToSourceOptions({
  parsedMessage,
  segment,
  segmentOccurrence,
  orderGroup,
  field,
}: {
  readonly parsedMessage: ParsedHl7Message
  readonly segment: Hl7Segment
  readonly segmentOccurrence: number
  readonly orderGroup: number | null
  readonly field: Hl7Field
}): SourceOption[] {
  const options: SourceOption[] = [
    createSourceOption({
      parsedMessage,
      segment,
      segmentOccurrence,
      orderGroup,
      field,
      valueShape:
        field.repetitions.length > 1
          ? "repeated"
          : repetitionShape(field.repetitions[0]),
    }),
  ]

  field.repetitions.forEach((repetition, repetitionIndex) => {
    const sourceRepetitionIndex =
      field.repetitions.length > 1 ? repetitionIndex + 1 : undefined

    if (sourceRepetitionIndex) {
      options.push(
        createSourceOption({
          parsedMessage,
          segment,
          segmentOccurrence,
          orderGroup,
          field,
          repetition,
          repetitionIndex: sourceRepetitionIndex,
          valueShape: repetitionShape(repetition),
        }),
      )
    }

    if (!hasStructuredComponents(repetition)) {
      return
    }

    repetition.components.forEach((component, componentIndex) => {
      options.push(
        createSourceOption({
          parsedMessage,
          segment,
          segmentOccurrence,
          orderGroup,
          field,
          repetition,
          repetitionIndex: sourceRepetitionIndex,
          component,
          componentIndex: componentIndex + 1,
          valueShape:
            component.subComponents.length > 1 ? "composite" : "scalar",
        }),
      )

      if (component.subComponents.length <= 1) {
        return
      }

      component.subComponents.forEach((_, subComponentIndex) => {
        options.push(
          createSourceOption({
            parsedMessage,
            segment,
            segmentOccurrence,
            orderGroup,
            field,
            repetition,
            repetitionIndex: sourceRepetitionIndex,
            component,
            componentIndex: componentIndex + 1,
            subComponentIndex: subComponentIndex + 1,
            valueShape: "scalar",
          }),
        )
      })
    })
  })

  return options
}

function createSourceOption({
  parsedMessage,
  segment,
  segmentOccurrence,
  orderGroup,
  field,
  repetition,
  repetitionIndex,
  component,
  componentIndex,
  subComponentIndex,
  valueShape,
}: {
  readonly parsedMessage: ParsedHl7Message
  readonly segment: Hl7Segment
  readonly segmentOccurrence: number
  readonly orderGroup: number | null
  readonly field: Hl7Field
  readonly repetition?: Hl7Repetition
  readonly repetitionIndex?: number
  readonly component?: Hl7Component
  readonly componentIndex?: number
  readonly subComponentIndex?: number
  readonly valueShape: SourceValueShape
}): SourceOption {
  const source = createSourceReference({
    segment: segment.name,
    field: field.index,
    repetition: repetitionIndex,
    component: componentIndex,
    subComponent: subComponentIndex,
    segmentIndex: segment.index,
    raw: segment.raw,
  })
  const previewValue = readSourceValue(parsedMessage, source)

  return {
    path: source.path,
    source,
    segment,
    segmentOccurrence,
    orderGroup,
    previewValue:
      typeof previewValue === "string"
        ? previewValue
        : (component?.value ?? repetition?.value ?? field.raw),
    valueShape,
  }
}

function hasStructuredComponents(repetition: Hl7Repetition): boolean {
  return (
    repetition.components.length > 1 ||
    repetition.components.some(
      (component) => component.subComponents.length > 1,
    )
  )
}

function repetitionShape(
  repetition: Hl7Repetition | undefined,
): SourceValueShape {
  return repetition && hasStructuredComponents(repetition)
    ? "composite"
    : "scalar"
}

export function searchSourceOptions(
  options: readonly SourceOption[],
  rawQuery: string,
  showEmpty: boolean,
): SourceSearchResult {
  const query = rawQuery.trim()
  const availableOptions = showEmpty
    ? options
    : options.filter((option) => option.previewValue !== "")

  if (query === "") {
    return { options: availableOptions, error: null }
  }

  const parsedPathQuery = parseSourceQuery(query)

  if (parsedPathQuery) {
    const matchingOptions = availableOptions
      .filter((option) => matchesSourceQuery(option, parsedPathQuery))
      .toSorted((left, right) => {
        const leftExact = left.path === parsedPathQuery.sourcePath ? 0 : 1
        const rightExact = right.path === parsedPathQuery.sourcePath ? 0 : 1

        return (
          leftExact - rightExact ||
          left.segment.index - right.segment.index ||
          getSourceDepth(left.source) - getSourceDepth(right.source)
        )
      })

    return { options: matchingOptions, error: null }
  }

  if (looksLikeSourcePath(query)) {
    return {
      options: [],
      error: "That HL7 path is not valid. Try PID, PID-5.1, or PID[2]-5.1.",
    }
  }

  const valueQuery = query.toLowerCase()

  return {
    options: availableOptions.filter((option) =>
      [option.path, option.previewValue, option.segment.name]
        .join(" ")
        .toLowerCase()
        .includes(valueQuery),
    ),
    error: null,
  }
}

function parseSourceQuery(rawQuery: string): ParsedSourceQuery | null {
  const query = rawQuery.trim().toUpperCase()
  const match = SOURCE_QUERY_PATTERN.exec(query)

  if (!match) {
    return null
  }

  const [
    ,
    segment,
    occurrenceText,
    field,
    repetition,
    component,
    subComponent,
  ] = match
  const sourcePath = field
    ? `${segment}-${field}${repetition ? `[${repetition}]` : ""}${component ? `.${component}` : ""}${subComponent ? `.${subComponent}` : ""}`
    : null

  return {
    segment: segment ?? "",
    occurrence: occurrenceText ? Number(occurrenceText) : null,
    sourcePath,
  }
}

function matchesSourceQuery(
  option: SourceOption,
  query: ParsedSourceQuery,
): boolean {
  if (option.segment.name !== query.segment) {
    return false
  }

  if (
    query.occurrence !== null &&
    option.segmentOccurrence !== query.occurrence
  ) {
    return false
  }

  if (!query.sourcePath) {
    return true
  }

  return (
    option.path === query.sourcePath ||
    option.path.startsWith(`${query.sourcePath}.`) ||
    option.path.startsWith(`${query.sourcePath}[`)
  )
}

function looksLikeSourcePath(query: string): boolean {
  return /^[A-Za-z0-9]{3}(?:-|\[)/.test(query.trim())
}

export function groupSourceOptions(
  options: readonly SourceOption[],
): SourceOptionGroup[] {
  const groups = new Map<string, SourceOptionGroup>()

  options.forEach((option) => {
    const key = getSegmentKey(option.segment)
    const currentGroup = groups.get(key)

    groups.set(key, {
      segment: option.segment,
      occurrence: option.segmentOccurrence,
      orderGroup: option.orderGroup,
      options: currentGroup ? [...currentGroup.options, option] : [option],
    })
  })

  return [...groups.values()]
}

export function findSourceOption(
  options: readonly SourceOption[],
  source: SourceReference | null | undefined,
): SourceOption | null {
  if (!source) {
    return null
  }

  if (source.segmentIndex !== null && source.segmentIndex !== undefined) {
    return (
      options.find(
        (option) =>
          option.path === source.path &&
          option.segment.index === source.segmentIndex,
      ) ?? null
    )
  }

  return options.find((option) => option.path === source.path) ?? null
}

export function isSameSource(
  left: SourceReference | null | undefined,
  right: SourceReference | null | undefined,
): boolean {
  return Boolean(
    left &&
    right &&
    left.path === right.path &&
    (left.segmentIndex ?? null) === (right.segmentIndex ?? null),
  )
}

export function getSegmentKey(segment: Hl7Segment): string {
  return `${segment.name}-${segment.index}`
}

export function getSourceLevelLabel(source: SourceReference): string {
  if (source.subComponent) {
    return `Subcomponent ${source.subComponent}`
  }

  if (source.component) {
    return `Component ${source.component}`
  }

  if (source.repetition) {
    return `Repetition ${source.repetition}`
  }

  return "Entire field"
}

function getSourceDepth(source: SourceReference): number {
  if (source.subComponent) {
    return 3
  }

  if (source.component) {
    return 2
  }

  if (source.repetition) {
    return 1
  }

  return 0
}
