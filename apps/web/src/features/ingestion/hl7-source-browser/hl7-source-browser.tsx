import { useMemo, useState } from "react"
import { AlertCircle, RotateCcw, Search, SlidersHorizontal } from "lucide-react"

import type {
  ClientProfile,
  ReviewableField,
  SourceReference,
} from "@hl7-data-mapper/contracts"
import { normalizedPathKind } from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"
import {
  readSource,
  type PersonNameSourceRole,
} from "@hl7-data-mapper/mapping-engine"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { Hl7SourceBuilder } from "./hl7-source-builder"
import { Hl7SourceGridDialog } from "./hl7-source-grid"
import { Hl7SourceResults } from "./hl7-source-results"
import { SelectedSourcePreview } from "./selected-source-preview"
import { SourceRecipeEditor } from "./source-recipe-editor"
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
  readonly profile?: ClientProfile
  readonly field: ReviewableField
  readonly onApplySource: (
    field: ReviewableField,
    source: SourceReference,
    sourceRole?: PersonNameSourceRole,
  ) => void
  readonly onApplySourceRecipe?: (
    field: ReviewableField,
    sources: readonly SourceReference[],
    joinSeparator: string,
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
  profile,
  field,
  onApplySource,
  onApplySourceRecipe,
}: Hl7SourceBrowserProps) {
  const isPersonNameField = isPersonNameReviewField(field)
  const mappedHl7Item = profile?.itemSet.items.find(
    (item) => item.id === field.hl7ItemId,
  )
  const initialRecipeSources =
    mappedHl7Item?.action === "join" ? mappedHl7Item.sources : []
  const [query, setQuery] = useState(field.primarySource?.segment ?? "")
  const [sourceRole, setSourceRole] = useState<PersonNameSourceRole>("family")
  const [showEmpty, setShowEmpty] = useState(false)
  const [searchIsOpen, setSearchIsOpen] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builder, setBuilder] =
    useState<SourceBuilderState>(EMPTY_SOURCE_BUILDER)
  const [selectedCandidate, setSelectedCandidate] =
    useState<SourceOption | null>(null)
  const [literalSplitSeparator, setLiteralSplitSeparator] = useState("")
  const [literalSplitPartNumber, setLiteralSplitPartNumber] = useState("1")
  const [recipeSources, setRecipeSources] =
    useState<SourceReference[]>(initialRecipeSources)
  const [joinSeparator, setJoinSeparator] = useState(
    mappedHl7Item?.joinSeparator ?? "",
  )
  const [recipeOpen, setRecipeOpen] = useState(initialRecipeSources.length > 0)
  const [context, setContext] = useState({ parsedMessage, field, profile })
  if (
    context.parsedMessage !== parsedMessage ||
    context.field !== field ||
    context.profile !== profile
  ) {
    setContext({ parsedMessage, field, profile })
    setQuery(field.primarySource?.segment ?? "")
    setSearchIsOpen(false)
    setSourceRole("family")
    setBuilder(EMPTY_SOURCE_BUILDER)
    setSelectedCandidate(null)
    setLiteralSplitSeparator("")
    setLiteralSplitPartNumber("1")
    setRecipeSources(initialRecipeSources)
    setJoinSeparator(mappedHl7Item?.joinSeparator ?? "")
    setRecipeOpen(initialRecipeSources.length > 0)
  }
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
  const parsedSplitPartNumber = Number(literalSplitPartNumber)
  const splitPartNumberIsValid =
    Number.isInteger(parsedSplitPartNumber) && parsedSplitPartNumber > 0
  const splitIsConfigured = literalSplitSeparator.length > 0
  const splitConfigurationError =
    splitIsConfigured && !splitPartNumberIsValid
      ? "Choose a part number of 1 or greater."
      : null
  const selectedSource =
    selectedCandidate && !splitConfigurationError
      ? {
          ...selectedCandidate.source,
          literalSplit: splitIsConfigured
            ? {
                separator: literalSplitSeparator,
                partNumber: parsedSplitPartNumber,
              }
            : undefined,
        }
      : null
  const selectedSourceRead = selectedSource
    ? readSource(parsedMessage, selectedSource)
    : null
  const sourceHasCompositeValue =
    selectedSourceRead?.value !== null &&
    selectedSourceRead?.value !== undefined &&
    [
      parsedMessage.delimiters.component,
      parsedMessage.delimiters.subcomponent,
      parsedMessage.delimiters.repetition,
    ].some((delimiter) => selectedSourceRead.value?.includes(delimiter))
  const candidateBlockReason = Array.isArray(field.value)
    ? "Choose an individual field within this record to change its source."
    : (splitConfigurationError ??
      (selectedSourceRead && selectedSourceRead.status !== "found"
        ? `This selection is ${selectedSourceRead.status.replaceAll("_", " ")}.`
        : null) ??
      (selectedSourceRead?.status === "found" &&
      !selectedSourceRead.value?.trim()
        ? "This selection has no usable text."
        : null) ??
      (splitIsConfigured
        ? (isPersonNameField || field.id.includes(":")) &&
          sourceHasCompositeValue
          ? "Choose a single value for this name or record field."
          : null
        : getCandidateBlockReason(
            selectedCandidate,
            isPersonNameField || field.id.includes(":"),
          )))
  const canCombineSources =
    Boolean(onApplySourceRecipe && field.hl7ItemId) &&
    mappedHl7Item?.valueType === "string" &&
    (mappedHl7Item.action === "extract" || mappedHl7Item.action === "join") &&
    !mappedHl7Item.transform &&
    !isPersonNameField &&
    !field.id.includes(":") &&
    !field.normalizedPath.includes("[") &&
    normalizedPathKind(field.normalizedPath) === "string" &&
    !Array.isArray(field.value)

  function chooseCandidate(sourceOption: SourceOption | null) {
    setSelectedCandidate(sourceOption)
    setLiteralSplitSeparator("")
    setLiteralSplitPartNumber("1")
  }

  function updateBuilder(nextBuilder: SourceBuilderState) {
    setBuilder(nextBuilder)
    chooseCandidate(null)
  }

  function resetToCurrentMapping() {
    if (!currentSourceOption) {
      return
    }

    setSearchIsOpen(true)
    setBuilderOpen(true)
    setQuery("")
    setBuilder(builderFromOption(currentSourceOption))
    setSelectedCandidate(currentSourceOption)
    setLiteralSplitSeparator(currentSource?.literalSplit?.separator ?? "")
    setLiteralSplitPartNumber(
      String(currentSource?.literalSplit?.partNumber ?? 1),
    )
  }

  function addSelectedSourceToRecipe() {
    if (!selectedSource || candidateBlockReason) return

    const sourceWithoutRawSegment = { ...selectedSource, raw: undefined }
    setRecipeSources((currentSources) =>
      currentSources.some((currentSource) =>
        sameSourceRule(currentSource, sourceWithoutRawSegment),
      )
        ? currentSources
        : [...currentSources, sourceWithoutRawSegment],
    )
    setRecipeOpen(true)
  }

  function moveRecipeSource(sourceIndex: number, direction: -1 | 1) {
    setRecipeSources((currentSources) => {
      const destinationIndex = sourceIndex + direction
      if (
        sourceIndex < 0 ||
        sourceIndex >= currentSources.length ||
        destinationIndex < 0 ||
        destinationIndex >= currentSources.length
      ) {
        return currentSources
      }

      const reorderedSources = [...currentSources]
      const sourceToMove = reorderedSources[sourceIndex]
      if (!sourceToMove) return currentSources
      reorderedSources[sourceIndex] = reorderedSources[destinationIndex]!
      reorderedSources[destinationIndex] = sourceToMove
      return reorderedSources
    })
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
                    chooseCandidate(null)
                    setBuilder(EMPTY_SOURCE_BUILDER)
                  }}
                >
                  {PERSON_NAME_SOURCE_LABELS[role]}
                </Button>
              ))}
            </div>
          </Field>
        ) : null}

        <Hl7SourceGridDialog
          parsedMessage={parsedMessage}
          sourceOptions={sourceOptions}
          currentSource={currentSource}
          onChooseSource={(sourceOption) => {
            if (
              isPersonNameField &&
              sourceOption.source.segment === "PID" &&
              sourceOption.source.field === 5 &&
              sourceOption.source.component
            ) {
              const matchingNameRole =
                PERSON_NAME_SOURCE_ROLES[sourceOption.source.component - 1]

              if (matchingNameRole) {
                setSourceRole(matchingNameRole)
              }
            }

            chooseCandidate(sourceOption)
          }}
        />

        <p className="text-xs text-muted-foreground">
          Start in the message grid to choose a row, field, or smaller part.
        </p>

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

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="justify-start"
          disabled={!currentSourceOption}
          onClick={resetToCurrentMapping}
        >
          <RotateCcw data-icon="inline-start" />
          Reset to current mapping
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-full justify-between"
          aria-expanded={searchIsOpen}
          onClick={() => setSearchIsOpen((isOpen) => !isOpen)}
        >
          <span className="flex items-center gap-2">
            <Search data-icon="inline-start" />
            Search by path or value
          </span>
          <span className="text-xs text-muted-foreground">
            {searchIsOpen ? "Hide" : "Show"}
          </span>
        </Button>

        {searchIsOpen ? (
          <div className="flex flex-col gap-3 border-t pt-3">
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
                    chooseCandidate(null)
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
            </div>

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
        ) : null}
      </div>

      {selectedCandidate ? (
        <SelectedSourcePreview
          candidate={selectedCandidate}
          destinationLabel={
            isPersonNameField
              ? PERSON_NAME_SOURCE_LABELS[sourceRole]
              : field.label
          }
          blockReason={
            !field.hl7ItemId
              ? "This field has no editable mapping source."
              : candidateBlockReason
          }
          selectedValue={selectedSourceRead?.value ?? "(unavailable)"}
          splitDescription={
            splitIsConfigured
              ? `Split on ${JSON.stringify(literalSplitSeparator)}, part ${literalSplitPartNumber}`
              : null
          }
          onAddToRecipe={
            canCombineSources ? addSelectedSourceToRecipe : undefined
          }
          onClear={() => chooseCandidate(null)}
          onApply={() => {
            if (!field.hl7ItemId || candidateBlockReason || !selectedSource)
              return
            onApplySource(
              field,
              selectedSource,
              isPersonNameField ? sourceRole : undefined,
            )
            chooseCandidate(null)
          }}
        >
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_92px] gap-2">
            <Field>
              <FieldLabel htmlFor={`literal-split-separator-${field.id}`}>
                Split by (optional)
              </FieldLabel>
              <Input
                id={`literal-split-separator-${field.id}`}
                value={literalSplitSeparator}
                placeholder="e.g. -"
                maxLength={32}
                onChange={(event) =>
                  setLiteralSplitSeparator(event.target.value)
                }
              />
            </Field>
            <Field data-invalid={Boolean(splitConfigurationError)}>
              <FieldLabel htmlFor={`literal-split-part-${field.id}`}>
                Take part
              </FieldLabel>
              <Input
                id={`literal-split-part-${field.id}`}
                type="number"
                min={1}
                value={literalSplitPartNumber}
                disabled={!splitIsConfigured}
                aria-invalid={Boolean(splitConfigurationError)}
                onChange={(event) =>
                  setLiteralSplitPartNumber(event.target.value)
                }
              />
            </Field>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Splitting happens after the selected HL7 field or component.
          </p>
        </SelectedSourcePreview>
      ) : null}

      {canCombineSources ? (
        <div className="border-b">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-full justify-between rounded-none px-3"
            aria-expanded={recipeOpen}
            onClick={() => setRecipeOpen((isOpen) => !isOpen)}
          >
            <span>Combine sources</span>
            <span className="text-xs text-muted-foreground">
              {recipeSources.length} selected · {recipeOpen ? "Hide" : "Show"}
            </span>
          </Button>
          {recipeOpen ? (
            <SourceRecipeEditor
              parsedMessage={parsedMessage}
              sources={recipeSources}
              joinSeparator={joinSeparator}
              onJoinSeparatorChange={setJoinSeparator}
              onMoveSource={moveRecipeSource}
              onRemoveSource={(sourceIndex) =>
                setRecipeSources((currentSources) =>
                  currentSources.filter((_, index) => index !== sourceIndex),
                )
              }
              onApply={() =>
                onApplySourceRecipe?.(field, recipeSources, joinSeparator)
              }
            />
          ) : null}
        </div>
      ) : null}

      {searchIsOpen ? (
        <>
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
            onSelect={chooseCandidate}
          />
        </>
      ) : null}
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

function sameSourceRule(
  firstSource: SourceReference,
  secondSource: SourceReference,
): boolean {
  return (
    firstSource.path === secondSource.path &&
    (firstSource.segmentIndex ?? null) ===
      (secondSource.segmentIndex ?? null) &&
    (firstSource.literalSplit?.separator ?? null) ===
      (secondSource.literalSplit?.separator ?? null) &&
    (firstSource.literalSplit?.partNumber ?? null) ===
      (secondSource.literalSplit?.partNumber ?? null)
  )
}
