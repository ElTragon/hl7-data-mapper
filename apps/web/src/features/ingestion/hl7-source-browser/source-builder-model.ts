import type {
  Hl7Component,
  Hl7Field,
  Hl7Repetition,
  Hl7Segment,
} from "@hl7-data-mapper/hl7-parser"

import type { SourceOption } from "./source-options"
import { searchSourceOptions } from "./source-search"

export type ValueMatchMode = "contains" | "equals" | "starts_with"

export type SourceBuilderState = {
  readonly segmentName: string | null
  readonly segmentIndex: number | null
  readonly field: number | null
  readonly repetition: number | null
  readonly component: number | null
  readonly subComponent: number | null
  readonly valueQuery: string
  readonly valueMatchMode: ValueMatchMode
}

export const EMPTY_SOURCE_BUILDER: SourceBuilderState = {
  segmentName: null,
  segmentIndex: null,
  field: null,
  repetition: null,
  component: null,
  subComponent: null,
  valueQuery: "",
  valueMatchMode: "contains",
}

export function buildSegmentChoices(segments: readonly Hl7Segment[]) {
  const counts = new Map<string, number>()

  segments.forEach((segment) =>
    counts.set(segment.name, (counts.get(segment.name) ?? 0) + 1),
  )

  return [...counts].map(([name, count]) => ({ name, count }))
}

export function hasStructuredComponents(repetition: Hl7Repetition): boolean {
  return (
    repetition.components.length > 1 ||
    repetition.components.some(
      (component) => component.subComponents.length > 1,
    )
  )
}

export function filterOptionsByBuilder(
  options: readonly SourceOption[],
  builder: SourceBuilderState,
): SourceOption[] {
  const valueQuery = builder.valueQuery.trim().toLowerCase()

  return options.filter((option) => {
    if (builder.segmentName && option.segment.name !== builder.segmentName) {
      return false
    }

    if (
      builder.segmentIndex !== null &&
      option.segment.index !== builder.segmentIndex
    ) {
      return false
    }

    if (builder.field !== null && option.source.field !== builder.field) {
      return false
    }

    if (
      builder.repetition !== null &&
      option.source.repetition !== builder.repetition
    ) {
      return false
    }

    if (
      builder.component !== null &&
      option.source.component !== builder.component
    ) {
      return false
    }

    if (
      builder.subComponent !== null &&
      option.source.subComponent !== builder.subComponent
    ) {
      return false
    }

    if (!valueQuery) {
      return true
    }

    const sourceValue = option.previewValue.toLowerCase()

    switch (builder.valueMatchMode) {
      case "equals":
        return sourceValue === valueQuery
      case "starts_with":
        return sourceValue.startsWith(valueQuery)
      case "contains":
        return sourceValue.includes(valueQuery)
    }
  })
}

export function countHiddenEmptyOptions({
  options,
  query,
  builder,
}: {
  readonly options: readonly SourceOption[]
  readonly query: string
  readonly builder: SourceBuilderState
}): number {
  const searchResult = searchSourceOptions(options, query, true)

  if (searchResult.error) {
    return 0
  }

  return filterOptionsByBuilder(searchResult.options, builder).filter(
    (option) => option.previewValue === "",
  ).length
}

export function buildBuilderPath(
  state: SourceBuilderState,
  context: {
    readonly selectedSegment: Hl7Segment | null
    readonly selectedSegmentOccurrence: number | null
    readonly segmentCount: number
    readonly selectedField: Hl7Field | null
    readonly selectedRepetition: Hl7Repetition | null
    readonly selectedComponent: Hl7Component | null
  },
): string | null {
  if (
    !state.segmentName ||
    !context.selectedSegment ||
    !context.selectedField
  ) {
    return null
  }

  const occurrence =
    context.segmentCount > 1 && context.selectedSegmentOccurrence
      ? `[${context.selectedSegmentOccurrence}]`
      : ""
  const repetition =
    context.selectedField.repetitions.length > 1 && state.repetition
      ? `[${state.repetition}]`
      : ""
  const component =
    context.selectedRepetition &&
    hasStructuredComponents(context.selectedRepetition) &&
    state.component
      ? `.${state.component}`
      : ""
  const subComponent =
    context.selectedComponent &&
    context.selectedComponent.subComponents.length > 1 &&
    state.subComponent
      ? `.${state.subComponent}`
      : ""

  return `${state.segmentName}${occurrence}-${state.field}${repetition}${component}${subComponent}`
}

export function buildBuilderChips(
  state: SourceBuilderState,
  options: readonly SourceOption[],
): string[] {
  const chips: string[] = []

  if (state.segmentName) {
    chips.push(state.segmentName)
  }

  if (state.segmentIndex !== null) {
    const option = options.find(
      (candidate) => candidate.segment.index === state.segmentIndex,
    )
    chips.push(`Occurrence ${option?.segmentOccurrence ?? "?"}`)
  }

  if (state.field !== null) {
    chips.push(`Field ${state.field}`)
  }

  if (state.repetition !== null) {
    chips.push(`Repetition ${state.repetition}`)
  }

  if (state.component !== null) {
    chips.push(`Component ${state.component}`)
  }

  if (state.subComponent !== null) {
    chips.push(`Subcomponent ${state.subComponent}`)
  }

  return chips
}

export function builderFromOption(option: SourceOption): SourceBuilderState {
  return {
    ...EMPTY_SOURCE_BUILDER,
    segmentName: option.segment.name,
    segmentIndex: option.segment.index,
    field: option.source.field,
    repetition: option.source.repetition ?? null,
    component: option.source.component ?? null,
    subComponent: option.source.subComponent ?? null,
  }
}
