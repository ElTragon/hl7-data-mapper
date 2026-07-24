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
