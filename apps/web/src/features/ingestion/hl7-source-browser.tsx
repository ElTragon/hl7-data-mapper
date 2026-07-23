import { useMemo, useState, type ReactNode } from "react"
import {
  AlertCircle,
  CheckCircle2,
  FileSearch,
  RotateCcw,
  Search,
  SlidersHorizontal,
  XCircle,
} from "lucide-react"

import type {
  ReviewableField,
  SourceReference,
} from "@hl7-data-mapper/contracts"
import type {
  Hl7Component,
  Hl7Field,
  Hl7Repetition,
  Hl7Segment,
  ParsedHl7Message,
} from "@hl7-data-mapper/hl7-parser"
import type { PersonNameSourceRole } from "@hl7-data-mapper/mapping-engine"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import {
  getSegmentLabel,
  getSourceDisplayLabel,
} from "./source-display-metadata"
import {
  buildSourceOptions,
  findSourceOption,
  getSegmentKey,
  getSourceLevelLabel,
  groupSourceOptions,
  isSameSource,
  searchSourceOptions,
  type SourceOption,
} from "./source-search"

export type Hl7SourceBrowserProps = {
  readonly parsedMessage: ParsedHl7Message
  readonly field: ReviewableField
  readonly onApplySource: (
    field: ReviewableField,
    source: SourceReference,
    sourceRole?: PersonNameSourceRole,
  ) => void
}

type ValueMatchMode = "contains" | "equals" | "starts_with"

type SourceBuilderState = {
  readonly segmentName: string | null
  readonly segmentIndex: number | null
  readonly field: number | null
  readonly repetition: number | null
  readonly component: number | null
  readonly subComponent: number | null
  readonly valueQuery: string
  readonly valueMatchMode: ValueMatchMode
}

const EMPTY_SOURCE_BUILDER: SourceBuilderState = {
  segmentName: null,
  segmentIndex: null,
  field: null,
  repetition: null,
  component: null,
  subComponent: null,
  valueQuery: "",
  valueMatchMode: "contains",
}

const PERSON_NAME_SOURCE_ROLES: readonly PersonNameSourceRole[] = [
  "family",
  "given",
  "middle",
  "suffix",
  "prefix",
]

const PERSON_NAME_SOURCE_LABELS: Record<PersonNameSourceRole, string> = {
  family: "Family",
  given: "Given",
  middle: "Middle",
  suffix: "Suffix",
  prefix: "Prefix",
}

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

export function Hl7SourceBrowser({
  parsedMessage,
  field,
  onApplySource,
}: Hl7SourceBrowserProps) {
  const isPersonNameField = isPersonNameReviewField(field)
  const [query, setQuery] = useState(field.primarySource?.segment ?? "")
  const [sourceRole, setSourceRole] = useState<PersonNameSourceRole>("family")
  const [showEmpty, setShowEmpty] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builder, setBuilder] =
    useState<SourceBuilderState>(EMPTY_SOURCE_BUILDER)
  const [selectedCandidate, setSelectedCandidate] =
    useState<SourceOption | null>(null)
  const sourceOptions = useMemo(
    () => buildSourceOptions(parsedMessage),
    [parsedMessage],
  )
  const currentSource = getCurrentSource(field, sourceRole, isPersonNameField)
  const currentSourceOption = findSourceOption(sourceOptions, currentSource)
  const searchResult = searchSourceOptions(sourceOptions, query, showEmpty)
  const builderOptions = filterOptionsByBuilder(searchResult.options, builder)
  const allBuilderOptions = filterOptionsByBuilder(sourceOptions, builder)
  const groupedOptions = groupSourceOptions(builderOptions)
  const hiddenEmptyCount = allBuilderOptions.filter(
    (option) => option.previewValue === "",
  ).length
  const candidateBlockReason = getCandidateBlockReason(
    selectedCandidate,
    isPersonNameField,
  )

  function updateBuilder(nextBuilder: SourceBuilderState) {
    setBuilder(nextBuilder)
    setSelectedCandidate(null)
  }

  function resetToCurrentMapping() {
    if (!currentSourceOption) {
      return
    }

    setBuilderOpen(true)
    setQuery("")
    setBuilder(builderFromOption(currentSourceOption))
    setSelectedCandidate(currentSourceOption)
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="space-y-3 border-b bg-muted/20 p-3">
        {isPersonNameField ? (
          <Field>
            <FieldLabel>Map selected source to</FieldLabel>
            <div
              role="group"
              aria-label="Map selected source to"
              className="grid grid-cols-2 gap-1 sm:grid-cols-3"
            >
              {PERSON_NAME_SOURCE_ROLES.map((role) => (
                <Button
                  key={role}
                  type="button"
                  size="sm"
                  variant={sourceRole === role ? "secondary" : "outline"}
                  aria-pressed={sourceRole === role}
                  onClick={() => {
                    setSourceRole(role)
                    setSelectedCandidate(null)
                    setBuilder(EMPTY_SOURCE_BUILDER)
                  }}
                >
                  {PERSON_NAME_SOURCE_LABELS[role]}
                </Button>
              ))}
            </div>
          </Field>
        ) : null}

        <Field>
          <FieldLabel htmlFor={`source-search-${field.id}`}>
            Find a source
          </FieldLabel>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`source-search-${field.id}`}
              className="pl-9 font-mono"
              value={query}
              placeholder="PID-5.1, PID[2]-5.1, or Lopez"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setQuery(event.target.value)
                setSelectedCandidate(null)
              }}
            />
          </div>
          <FieldDescription>
            Search by path or value, or use the guided builder.
          </FieldDescription>
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={(event) => setShowEmpty(event.target.checked)}
            />
            Show empty fields
          </label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!currentSourceOption}
            onClick={resetToCurrentMapping}
          >
            <RotateCcw data-icon="inline-start" />
            Reset to current mapping
          </Button>
        </div>

        {currentSource && !currentSourceOption ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Current source not found</AlertTitle>
            <AlertDescription>
              The saved mapping references {currentSource.path}, but that source
              is absent from this message. Choose a replacement or mark the
              field unavailable.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="border-t pt-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-full justify-between"
            aria-expanded={builderOpen}
            aria-controls={`source-builder-${field.id}`}
            onClick={() => setBuilderOpen((isOpen) => !isOpen)}
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal data-icon="inline-start" />
              Build a source path
            </span>
            <span className="text-xs text-muted-foreground">
              {builderOpen ? "Hide" : "Show"}
            </span>
          </Button>

          {builderOpen ? (
            <SourceBuilder
              id={`source-builder-${field.id}`}
              parsedMessage={parsedMessage}
              sourceOptions={sourceOptions}
              state={builder}
              onChange={(nextBuilder) => {
                setQuery("")
                updateBuilder(nextBuilder)
              }}
              onClear={() => updateBuilder(EMPTY_SOURCE_BUILDER)}
            />
          ) : null}
        </div>
      </div>

      {selectedCandidate ? (
        <SelectedSourcePreview
          candidate={selectedCandidate}
          destinationLabel={
            isPersonNameField
              ? PERSON_NAME_SOURCE_LABELS[sourceRole]
              : field.label
          }
          blockReason={candidateBlockReason}
          onClear={() => setSelectedCandidate(null)}
          onApply={() => {
            onApplySource(
              field,
              selectedCandidate.source,
              isPersonNameField ? sourceRole : undefined,
            )
            setSelectedCandidate(null)
          }}
        />
      ) : null}

      <div className="flex items-center justify-between gap-3 border-b px-3 py-2 text-xs text-muted-foreground">
        <span>
          {builderOptions.length} result
          {builderOptions.length === 1 ? "" : "s"}
        </span>
        <span>Select a source to preview it</span>
      </div>

      {searchResult.error ? (
        <p className="border-b px-3 py-3 text-sm text-destructive">
          {searchResult.error}
        </p>
      ) : null}

      <div className="max-h-[420px] overflow-auto">
        {groupedOptions.map((group) => (
          <section key={getSegmentKey(group.segment)}>
            <div className="sticky top-0 z-10 border-b bg-muted/95 px-3 py-2 backdrop-blur-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">
                  {group.segment.name} occurrence {group.occurrence}
                </span>
                <span className="text-xs text-muted-foreground">
                  {getSegmentLabel(group.segment.name)}
                </span>
                <Badge variant="outline">
                  Message row {group.segment.index + 1}
                </Badge>
                {group.orderGroup ? (
                  <Badge variant="outline">
                    Order group {group.orderGroup}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                {group.segment.raw}
              </p>
            </div>

            {group.options.map((option) => {
              const optionBlockReason = getCandidateBlockReason(
                option,
                isPersonNameField,
              )
              const selected = isSameSource(
                selectedCandidate?.source,
                option.source,
              )

              return (
                <div
                  key={`${option.segment.index}-${option.path}`}
                  data-source-option={option.path}
                  className={[
                    "flex items-center justify-between gap-3 border-b px-3 py-2.5",
                    selected ? "bg-teal-50/70" : "",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {getSourceDisplayLabel(option.path)}
                      </span>
                      <span className="font-mono text-xs">{option.path}</span>
                      <span className="text-xs text-muted-foreground">
                        {getSourceLevelLabel(option.source)}
                      </span>
                      {isSameSource(currentSource, option.source) ? (
                        <Badge variant="secondary">Current</Badge>
                      ) : null}
                    </div>
                    <p
                      className={[
                        "mt-1 break-words text-sm",
                        option.previewValue === ""
                          ? "text-muted-foreground"
                          : "",
                      ].join(" ")}
                    >
                      {option.previewValue === ""
                        ? "Empty in this message"
                        : option.previewValue}
                    </p>
                    {optionBlockReason ? (
                      <p className="mt-1 text-xs text-amber-700">
                        {optionBlockReason}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={selected ? "secondary" : "outline"}
                    disabled={
                      !field.hl7ItemId ||
                      option.previewValue === "" ||
                      Boolean(optionBlockReason)
                    }
                    onClick={() => setSelectedCandidate(option)}
                  >
                    {selected ? (
                      <CheckCircle2 data-icon="inline-start" />
                    ) : null}
                    {selected ? "Selected" : "Select"}
                  </Button>
                </div>
              )
            })}
          </section>
        ))}

        {!searchResult.error && groupedOptions.length === 0 ? (
          <NoSourceResults
            query={query}
            hiddenEmptyCount={showEmpty ? 0 : hiddenEmptyCount}
          />
        ) : null}
      </div>
    </div>
  )
}

function SourceBuilder({
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
    <div id={id} className="mt-3 space-y-4 rounded-lg border bg-background p-3">
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
              const componentPath = selectedSegment
                ? `${selectedSegment.name}-${selectedField?.index ?? ""}.${index + 1}`
                : ""

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
        <div className="space-y-2">
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
        <div className="space-y-3 border-t p-3">
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

function SelectedSourcePreview({
  candidate,
  destinationLabel,
  blockReason,
  onClear,
  onApply,
}: {
  readonly candidate: SourceOption
  readonly destinationLabel: string
  readonly blockReason: string | null
  readonly onClear: () => void
  readonly onApply: () => void
}) {
  return (
    <div data-selected-source-preview className="border-b bg-teal-50/70 p-3">
      <div className="flex items-start gap-3">
        <FileSearch className="mt-0.5 size-4 shrink-0 text-teal-700" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Selected source</p>
            <Badge variant="outline">{destinationLabel}</Badge>
          </div>
          <p className="mt-2 text-sm font-medium">
            {getSourceDisplayLabel(candidate.path)}
          </p>
          <p className="mt-1 font-mono text-xs">
            {candidate.segment.name} occurrence {candidate.segmentOccurrence} ·{" "}
            Message row {candidate.segment.index + 1} · {candidate.path}
          </p>
          <p className="mt-2 break-words text-sm">{candidate.previewValue}</p>
          {blockReason ? (
            <p className="mt-2 text-xs text-amber-700">{blockReason}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          Clear selection
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={Boolean(blockReason)}
          onClick={onApply}
        >
          Use this source
        </Button>
      </div>
    </div>
  )
}

function NoSourceResults({
  query,
  hiddenEmptyCount,
}: {
  readonly query: string
  readonly hiddenEmptyCount: number
}) {
  const occurrenceMatch = /^([A-Z0-9]{3})\[(\d+)\]/i.exec(query.trim())

  if (hiddenEmptyCount > 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        {hiddenEmptyCount} matching source
        {hiddenEmptyCount === 1 ? " exists" : "s exist"}, but the value is
        empty. Turn on Show empty fields to inspect it.
      </p>
    )
  }

  return (
    <p className="p-6 text-center text-sm text-muted-foreground">
      {occurrenceMatch
        ? `No ${occurrenceMatch[1]?.toUpperCase()} occurrence ${occurrenceMatch[2]} exists with that source path.`
        : "No source fields match this search or builder selection."}
    </p>
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

function buildSegmentChoices(segments: readonly Hl7Segment[]) {
  const counts = new Map<string, number>()

  segments.forEach((segment) =>
    counts.set(segment.name, (counts.get(segment.name) ?? 0) + 1),
  )

  return [...counts].map(([name, count]) => ({ name, count }))
}

function hasStructuredComponents(repetition: Hl7Repetition): boolean {
  return (
    repetition.components.length > 1 ||
    repetition.components.some(
      (component) => component.subComponents.length > 1,
    )
  )
}

function filterOptionsByBuilder(
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
      (option.source.repetition ?? 1) !== builder.repetition
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

function buildBuilderPath(
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

function buildBuilderChips(
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

function builderFromOption(option: SourceOption): SourceBuilderState {
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

function getCurrentSource(
  field: ReviewableField,
  sourceRole: PersonNameSourceRole,
  isPersonNameField: boolean,
): SourceReference | null {
  if (!isPersonNameField) {
    return field.primarySource ?? null
  }

  const roleIndex = PERSON_NAME_SOURCE_ROLES.indexOf(sourceRole)

  return field.sources[roleIndex] ?? field.primarySource ?? null
}

function getCandidateBlockReason(
  candidate: SourceOption | null,
  isPersonNameField: boolean,
): string | null {
  if (!candidate) {
    return null
  }

  if (candidate.previewValue === "") {
    return "This source exists but is empty in the current message."
  }

  if (isPersonNameField && candidate.valueShape !== "scalar") {
    return "Choose a scalar component for a name part instead of the complete composite or repeated field."
  }

  return null
}

function isPersonNameReviewField(field: ReviewableField): boolean {
  return (
    field.normalizedPath.endsWith(".name") &&
    field.value !== null &&
    typeof field.value === "object" &&
    ("family" in field.value || "given" in field.value)
  )
}
