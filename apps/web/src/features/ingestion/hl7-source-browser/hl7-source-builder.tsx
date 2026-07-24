import type { ReactNode } from "react"
import { XCircle } from "lucide-react"

import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import {
  buildBuilderChips,
  buildBuilderPath,
  buildSegmentChoices,
  EMPTY_SOURCE_BUILDER,
  hasStructuredComponents,
  type SourceBuilderState,
  type ValueMatchMode,
} from "./source-builder-model"
import {
  getSegmentLabel,
  getSourceDisplayLabel,
} from "./source-display-metadata"
import type { SourceOption } from "./source-options"

const VALUE_MATCH_MODES: readonly ValueMatchMode[] = [
  "contains",
  "equals",
  "starts_with",
]

const VALUE_MATCH_MODE_LABELS: Record<ValueMatchMode, string> = {
  contains: "Contains",
  equals: "Equals",
  starts_with: "Starts with",
}

export function Hl7SourceBuilder({
  id,
  parsedMessage,
  sourceOptions,
  state,
  onChange,
  onClear,
}: {
  readonly id: string
  readonly parsedMessage: ParsedHl7Message
  readonly sourceOptions: readonly SourceOption[]
  readonly state: SourceBuilderState
  readonly onChange: (state: SourceBuilderState) => void
  readonly onClear: () => void
}) {
  const segmentChoices = buildSegmentChoices(parsedMessage.segments)
  const matchingSegments = state.segmentName
    ? parsedMessage.segments.filter(
        (segment) => segment.name === state.segmentName,
      )
    : []
  const selectedSegment =
    matchingSegments.find((segment) => segment.index === state.segmentIndex) ??
    (matchingSegments.length === 1 ? matchingSegments[0] : null)
  const selectedSegmentOccurrence = selectedSegment
    ? matchingSegments.findIndex(
        (segment) => segment.index === selectedSegment.index,
      ) + 1
    : null
  const selectedField =
    selectedSegment?.fields.find((field) => field.index === state.field) ?? null
  const repetitionChoices = selectedField?.repetitions ?? []
  const selectedRepetition =
    selectedField && repetitionChoices.length === 1
      ? repetitionChoices[0]
      : (repetitionChoices[(state.repetition ?? 0) - 1] ?? null)
  const componentChoices =
    selectedRepetition && hasStructuredComponents(selectedRepetition)
      ? selectedRepetition.components
      : []
  const selectedComponent = componentChoices[(state.component ?? 0) - 1] ?? null
  const subComponentChoices =
    selectedComponent && selectedComponent.subComponents.length > 1
      ? selectedComponent.subComponents
      : []
  const resolvedPath = buildBuilderPath(state, {
    selectedSegment,
    selectedSegmentOccurrence,
    segmentCount: matchingSegments.length,
    selectedField,
    selectedRepetition,
    selectedComponent,
  })
  const activeChips = buildBuilderChips(state, sourceOptions)

  return (
    <div
      id={id}
      className="mt-3 flex flex-col gap-4 rounded-lg border bg-background p-3"
    >
      <Field>
        <FieldLabel htmlFor={`${id}-segment`}>Segment</FieldLabel>
        <NativeSelect
          id={`${id}-segment`}
          value={state.segmentName ?? ""}
          onChange={(value) => {
            const segments = parsedMessage.segments.filter(
              (segment) => segment.name === value,
            )

            onChange({
              ...EMPTY_SOURCE_BUILDER,
              segmentName: value || null,
              segmentIndex:
                segments.length === 1 ? (segments[0]?.index ?? null) : null,
            })
          }}
        >
          <option value="">Choose a segment</option>
          {segmentChoices.map((choice) => (
            <option key={choice.name} value={choice.name}>
              {choice.name} — {getSegmentLabel(choice.name)} ({choice.count})
            </option>
          ))}
        </NativeSelect>
      </Field>

      {matchingSegments.length > 1 ? (
        <Field>
          <FieldLabel htmlFor={`${id}-occurrence`}>
            Segment occurrence
          </FieldLabel>
          <NativeSelect
            id={`${id}-occurrence`}
            value={
              state.segmentIndex === null ? "" : String(state.segmentIndex)
            }
            onChange={(value) =>
              onChange({
                ...state,
                segmentIndex: value ? Number(value) : null,
                field: null,
                repetition: null,
                component: null,
                subComponent: null,
              })
            }
          >
            <option value="">Choose an occurrence</option>
            {matchingSegments.map((segment, index) => (
              <option key={segment.index} value={segment.index}>
                Occurrence {index + 1} · Message row {segment.index + 1}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}

      {selectedSegment ? (
        <Field>
          <FieldLabel htmlFor={`${id}-field`}>Field</FieldLabel>
          <NativeSelect
            id={`${id}-field`}
            value={state.field === null ? "" : String(state.field)}
            onChange={(value) =>
              onChange({
                ...state,
                field: value ? Number(value) : null,
                repetition: null,
                component: null,
                subComponent: null,
              })
            }
          >
            <option value="">Choose a field</option>
            {selectedSegment.fields.map((field) => (
              <option key={field.index} value={field.index}>
                {selectedSegment.name}-{field.index} —{" "}
                {getSourceDisplayLabel(
                  `${selectedSegment.name}-${field.index}`,
                )}
                {field.raw === "" ? " (empty)" : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}

      {repetitionChoices.length > 1 ? (
        <Field>
          <FieldLabel htmlFor={`${id}-repetition`}>Repetition</FieldLabel>
          <NativeSelect
            id={`${id}-repetition`}
            value={state.repetition === null ? "" : String(state.repetition)}
            onChange={(value) =>
              onChange({
                ...state,
                repetition: value ? Number(value) : null,
                component: null,
                subComponent: null,
              })
            }
          >
            <option value="">Choose a repetition</option>
            {repetitionChoices.map((repetition, index) => (
              <option key={index} value={index + 1}>
                Repetition {index + 1}
                {repetition.value === "" ? " (empty)" : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}

      {componentChoices.length > 0 ? (
        <Field>
          <FieldLabel htmlFor={`${id}-component`}>Component</FieldLabel>
          <NativeSelect
            id={`${id}-component`}
            value={state.component === null ? "" : String(state.component)}
            onChange={(value) =>
              onChange({
                ...state,
                component: value ? Number(value) : null,
                subComponent: null,
              })
            }
          >
            <option value="">Use the complete field or repetition</option>
            {componentChoices.map((component, index) => {
              const componentPath = `${selectedSegment?.name ?? ""}-${selectedField?.index ?? ""}.${index + 1}`

              return (
                <option key={index} value={index + 1}>
                  {componentPath} — {getSourceDisplayLabel(componentPath)}
                  {component.value === "" ? " (empty)" : ""}
                </option>
              )
            })}
          </NativeSelect>
        </Field>
      ) : null}

      {subComponentChoices.length > 0 ? (
        <Field>
          <FieldLabel htmlFor={`${id}-subcomponent`}>Subcomponent</FieldLabel>
          <NativeSelect
            id={`${id}-subcomponent`}
            value={
              state.subComponent === null ? "" : String(state.subComponent)
            }
            onChange={(value) =>
              onChange({
                ...state,
                subComponent: value ? Number(value) : null,
              })
            }
          >
            <option value="">Use the complete component</option>
            {subComponentChoices.map((value, index) => (
              <option key={index} value={index + 1}>
                Subcomponent {index + 1}
                {value === "" ? " (empty)" : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}

      {state.segmentName ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium">Current builder selections</p>
          <div className="flex flex-wrap gap-1">
            {activeChips.map((chip) => (
              <Badge key={chip} variant="outline">
                {chip}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <details className="rounded-md border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
          Filter results by value
        </summary>
        <div className="flex flex-col gap-3 border-t p-3">
          <Field>
            <FieldLabel htmlFor={`${id}-value`}>Value</FieldLabel>
            <Input
              id={`${id}-value`}
              value={state.valueQuery}
              placeholder="Lopez"
              autoComplete="off"
              onChange={(event) =>
                onChange({ ...state, valueQuery: event.target.value })
              }
            />
          </Field>
          <div
            role="group"
            aria-label="Value comparison"
            className="grid grid-cols-3 gap-1"
          >
            {VALUE_MATCH_MODES.map((mode) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={
                  state.valueMatchMode === mode ? "secondary" : "outline"
                }
                aria-pressed={state.valueMatchMode === mode}
                onClick={() => onChange({ ...state, valueMatchMode: mode })}
              >
                {VALUE_MATCH_MODE_LABELS[mode]}
              </Button>
            ))}
          </div>
        </div>
      </details>

      <div className="rounded-md border bg-muted/30 p-2.5 text-xs">
        <p className="font-medium">Resolved source path</p>
        <p className="mt-1 break-words font-mono text-muted-foreground">
          {resolvedPath ??
            "Choose a segment and field to preview the source path."}
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={state.segmentName === null && state.valueQuery === ""}
          onClick={onClear}
        >
          <XCircle data-icon="inline-start" />
          Clear builder
        </Button>
      </div>
    </div>
  )
}

function NativeSelect({
  id,
  value,
  children,
  onChange,
}: {
  readonly id: string
  readonly value: string
  readonly children: ReactNode
  readonly onChange: (value: string) => void
}) {
  return (
    <select
      id={id}
      className="h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  )
}
