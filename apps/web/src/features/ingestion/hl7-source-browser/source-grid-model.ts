import type { SourceReference } from "@hl7-data-mapper/contracts"
import type {
  Hl7Field,
  Hl7Segment,
  ParsedHl7Message,
} from "@hl7-data-mapper/hl7-parser"

import type { SourceOption } from "./source-options"

export type SourceGridRow = {
  readonly segment: Hl7Segment
  readonly messageRowNumber: number
  readonly segmentOccurrenceNumber: number
  readonly fieldsByNumber: ReadonlyMap<number, Hl7Field>
  readonly sourceOptionsByFieldNumber: ReadonlyMap<
    number,
    readonly SourceOption[]
  >
}

export type SourceGridFilters = {
  readonly segmentName: string
  readonly messageRowNumber: string
  readonly searchText: string
}

export type SourceGridCoordinate = {
  readonly segmentName: string
  readonly messageRowNumber: number | null
  readonly fieldNumber: number
  readonly repetitionNumber: number | null
  readonly componentNumber: number | null
  readonly subComponentNumber: number | null
}

const GRID_COORDINATE_PATTERN =
  /^([A-Z0-9]{3})(?:\(\s*(?:row\s*)?(\d+)\s*\))?\s*[×x]\s*(\d+)(?:\[(\d+)\])?(?:\.(\d+))?(?:\.(\d+))?$/i

export function parseSourceGridCoordinate(
  coordinateText: string,
): SourceGridCoordinate | null {
  const match = GRID_COORDINATE_PATTERN.exec(coordinateText.trim())
  if (!match) return null

  const [
    ,
    segmentName,
    messageRowText,
    fieldText,
    repetitionText,
    componentText,
    subComponentText,
  ] = match
  const messageRowNumber = messageRowText ? Number(messageRowText) : null
  const fieldNumber = Number(fieldText)
  const repetitionNumber = repetitionText ? Number(repetitionText) : null
  const componentNumber = componentText ? Number(componentText) : null
  const subComponentNumber = subComponentText ? Number(subComponentText) : null
  const coordinateNumbers = [
    fieldNumber,
    messageRowNumber,
    repetitionNumber,
    componentNumber,
    subComponentNumber,
  ].filter((number): number is number => number !== null)
  if (
    coordinateNumbers.some((number) => !Number.isInteger(number) || number < 1)
  ) {
    return null
  }

  return {
    segmentName: segmentName!.toUpperCase(),
    messageRowNumber,
    fieldNumber,
    repetitionNumber,
    componentNumber,
    subComponentNumber,
  }
}

export function buildSourceGridRows(
  parsedMessage: ParsedHl7Message,
  sourceOptions: readonly SourceOption[],
): SourceGridRow[] {
  const optionsBySegmentAndField = new Map<
    number,
    Map<number, SourceOption[]>
  >()

  for (const sourceOption of sourceOptions) {
    const segmentIndex = sourceOption.segment.index
    const fieldNumber = sourceOption.source.field
    const optionsByFieldNumber =
      optionsBySegmentAndField.get(segmentIndex) ??
      new Map<number, SourceOption[]>()
    const optionsForField = optionsByFieldNumber.get(fieldNumber) ?? []

    optionsForField.push(sourceOption)
    optionsByFieldNumber.set(fieldNumber, optionsForField)
    optionsBySegmentAndField.set(segmentIndex, optionsByFieldNumber)
  }

  const occurrencesBySegmentName = new Map<string, number>()

  return parsedMessage.segments.map((segment) => {
    const segmentOccurrenceNumber =
      (occurrencesBySegmentName.get(segment.name) ?? 0) + 1

    occurrencesBySegmentName.set(segment.name, segmentOccurrenceNumber)

    return {
      segment,
      messageRowNumber: segment.index + 1,
      segmentOccurrenceNumber,
      fieldsByNumber: new Map(
        segment.fields.map((field) => [field.index, field]),
      ),
      sourceOptionsByFieldNumber:
        optionsBySegmentAndField.get(segment.index) ?? new Map(),
    }
  })
}

export function filterSourceGridRows(
  sourceGridRows: readonly SourceGridRow[],
  filters: SourceGridFilters,
): SourceGridRow[] {
  const searchText = filters.searchText.trim().toLowerCase()
  const messageRowNumber = filters.messageRowNumber.trim()
  const requestedCoordinate = parseSourceGridCoordinate(filters.searchText)

  return sourceGridRows.filter((sourceGridRow) => {
    if (
      filters.segmentName &&
      sourceGridRow.segment.name !== filters.segmentName
    ) {
      return false
    }

    if (requestedCoordinate) {
      return (
        sourceGridRow.segment.name === requestedCoordinate.segmentName &&
        (requestedCoordinate.messageRowNumber === null ||
          sourceGridRow.messageRowNumber ===
            requestedCoordinate.messageRowNumber) &&
        sourceGridRow.fieldsByNumber.has(requestedCoordinate.fieldNumber)
      )
    }

    if (
      messageRowNumber &&
      String(sourceGridRow.messageRowNumber) !== messageRowNumber
    ) {
      return false
    }

    if (!searchText) {
      return true
    }

    if (
      sourceGridRow.segment.name.toLowerCase().includes(searchText) ||
      sourceGridRow.segment.raw.toLowerCase().includes(searchText) ||
      `row ${sourceGridRow.messageRowNumber}`.includes(searchText)
    ) {
      return true
    }

    for (const sourceOptions of sourceGridRow.sourceOptionsByFieldNumber.values()) {
      if (
        sourceOptions.some(
          (sourceOption) =>
            sourceOption.path.toLowerCase().includes(searchText) ||
            sourceOption.previewValue.toLowerCase().includes(searchText),
        )
      ) {
        return true
      }
    }

    return false
  })
}

export function formatGridCoordinate(sourceOption: SourceOption): string {
  return formatSourceReferenceCoordinate(sourceOption.source)
}

export function formatSourceReferenceCoordinate(
  sourceReference: SourceReference,
): string {
  const messageRowLabel =
    sourceReference.segmentIndex === undefined ||
    sourceReference.segmentIndex === null
      ? "first match"
      : `row ${sourceReference.segmentIndex + 1}`
  const repetition = sourceReference.repetition
    ? `[${sourceReference.repetition}]`
    : ""
  const component = sourceReference.component
    ? `.${sourceReference.component}`
    : ""
  const subComponent = sourceReference.subComponent
    ? `.${sourceReference.subComponent}`
    : ""

  return `${sourceReference.segment}(${messageRowLabel}) × ${sourceReference.field}${repetition}${component}${subComponent}`
}

export function getLargestFieldNumber(
  sourceGridRows: readonly SourceGridRow[],
): number {
  let largestFieldNumber = 0

  for (const sourceGridRow of sourceGridRows) {
    for (const fieldNumber of sourceGridRow.fieldsByNumber.keys()) {
      largestFieldNumber = Math.max(largestFieldNumber, fieldNumber)
    }
  }

  return largestFieldNumber
}
