import { useMemo, useState } from "react"
import { AlertCircle, RotateCcw, Search, SlidersHorizontal } from "lucide-react"

import type {
  ReviewableField,
  SourceReference,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"
import type { PersonNameSourceRole } from "@hl7-data-mapper/mapping-engine"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { Hl7SourceBuilder } from "./hl7-source-builder"
import { Hl7SourceResults } from "./hl7-source-results"
import { SelectedSourcePreview } from "./selected-source-preview"
import {
  builderFromOption,
  countHiddenEmptyOptions,
  EMPTY_SOURCE_BUILDER,
  filterOptionsByBuilder,
  type SourceBuilderState,
} from "./source-builder-model"
import { buildSourceOptions, type SourceOption } from "./source-options"
import { getCandidateBlockReason } from "./source-selection-rules"
import {
  findSourceOption,
  groupSourceOptions,
  searchSourceOptions,
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
  const groupedOptions = groupSourceOptions(builderOptions)
  const hiddenEmptyCount = showEmpty
    ? 0
    : countHiddenEmptyOptions({
        options: sourceOptions,
        query,
        builder,
      })
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
      <div className="flex flex-col gap-3 border-b bg-muted/20 p-3">
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
            <Hl7SourceBuilder
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

      <Hl7SourceResults
        groups={groupedOptions}
        query={query}
        searchError={searchResult.error}
        hiddenEmptyCount={hiddenEmptyCount}
        selectedCandidate={selectedCandidate}
        currentSource={currentSource}
        isPersonNameField={isPersonNameField}
        canApply={Boolean(field.hl7ItemId)}
        onSelect={setSelectedCandidate}
      />
    </div>
  )
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

function isPersonNameReviewField(field: ReviewableField): boolean {
  return (
    field.normalizedPath.endsWith(".name") &&
    field.value !== null &&
    typeof field.value === "object" &&
    ("family" in field.value || "given" in field.value)
  )
}
