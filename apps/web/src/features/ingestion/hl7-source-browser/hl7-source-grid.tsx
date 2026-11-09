import { useMemo, useRef, useState } from "react"
import { Grid2X2, Search } from "lucide-react"

import {
  buildSourcePath,
  type SourceReference,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { getSourceDisplayLabel } from "./source-display-metadata"
import {
  buildSourceGridRows,
  filterSourceGridRows,
  formatGridCoordinate,
  getLargestFieldNumber,
  parseSourceGridCoordinate,
} from "./source-grid-model"
import type { SourceOption } from "./source-options"
import { findSourceOption } from "./source-search"

const MAX_RENDERED_MESSAGE_ROWS = 60

export function Hl7SourceGridDialog({
  parsedMessage,
  sourceOptions,
  currentSource,
  onChooseSource,
}: {
  readonly parsedMessage: ParsedHl7Message
  readonly sourceOptions: readonly SourceOption[]
  readonly currentSource: SourceReference | null
  readonly onChooseSource: (sourceOption: SourceOption) => void
}) {
  const [gridIsOpen, setGridIsOpen] = useState(false)

  return (
    <Dialog open={gridIsOpen} onOpenChange={setGridIsOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="w-full justify-start">
          <Grid2X2 data-icon="inline-start" />
          Browse message as a grid
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] min-w-0 gap-0 overflow-x-hidden overflow-y-auto p-0 sm:max-w-[min(96vw,1120px)]">
        <DialogHeader className="sticky top-0 z-30 border-b bg-background px-5 py-4 pr-12">
          <DialogTitle>Browse HL7 message</DialogTitle>
          <DialogDescription>
            Rows keep their original message numbers. Columns use HL7 field
            numbers; choose a cell to see its smaller parts.
          </DialogDescription>
        </DialogHeader>
        {gridIsOpen ? (
          <Hl7SourceGrid
            parsedMessage={parsedMessage}
            sourceOptions={sourceOptions}
            currentSource={currentSource}
            onChooseSource={(sourceOption) => {
              onChooseSource(sourceOption)
              setGridIsOpen(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Hl7SourceGrid({
  parsedMessage,
  sourceOptions,
  currentSource,
  onChooseSource,
}: {
  readonly parsedMessage: ParsedHl7Message
  readonly sourceOptions: readonly SourceOption[]
  readonly currentSource: SourceReference | null
  readonly onChooseSource: (sourceOption: SourceOption) => void
}) {
  const sourceGridRows = useMemo(
    () => buildSourceGridRows(parsedMessage, sourceOptions),
    [parsedMessage, sourceOptions],
  )
  const segmentNames = useMemo(
    () => [...new Set(parsedMessage.segments.map((segment) => segment.name))],
    [parsedMessage],
  )
  const largestFieldNumber = useMemo(
    () => getLargestFieldNumber(sourceGridRows),
    [sourceGridRows],
  )
  const fieldNumbers = useMemo(
    () => Array.from({ length: largestFieldNumber }, (_, index) => index + 1),
    [largestFieldNumber],
  )
  const initialSourceOption =
    findSourceOption(sourceOptions, currentSource) ??
    sourceOptions.find((sourceOption) => sourceOption.previewValue !== "") ??
    sourceOptions[0] ??
    null
  const [selectedSourceOption, setSelectedSourceOption] =
    useState<SourceOption | null>(initialSourceOption)
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(
    initialSourceOption?.segment.index ?? parsedMessage.segments[0]?.index ?? 0,
  )
  const [selectedFieldNumber, setSelectedFieldNumber] = useState(
    initialSourceOption?.source.field ?? 1,
  )
  const [segmentNameFilter, setSegmentNameFilter] = useState("")
  const [messageRowNumberFilter, setMessageRowNumberFilter] = useState("")
  const [fieldNumberToFind, setFieldNumberToFind] = useState("")
  const [searchText, setSearchText] = useState("")
  const [showEmptyFields, setShowEmptyFields] = useState(false)
  const tableContainerReference = useRef<HTMLDivElement | null>(null)

  const matchingSourceGridRows = filterSourceGridRows(sourceGridRows, {
    segmentName: segmentNameFilter,
    messageRowNumber: messageRowNumberFilter,
    searchText,
  })
  const renderedSourceGridRows = matchingSourceGridRows.slice(
    0,
    MAX_RENDERED_MESSAGE_ROWS,
  )
  const selectedSourceGridRow =
    renderedSourceGridRows.find(
      (sourceGridRow) => sourceGridRow.segment.index === selectedSegmentIndex,
    ) ?? null
  const selectedField =
    selectedSourceGridRow?.fieldsByNumber.get(selectedFieldNumber) ?? null
  const availableSourceOptions =
    selectedSourceGridRow?.sourceOptionsByFieldNumber
      .get(selectedFieldNumber)
      ?.filter(
        (sourceOption) => showEmptyFields || sourceOption.previewValue !== "",
      ) ?? []
  const visibleSelectedSourceOption =
    selectedSourceOption &&
    availableSourceOptions.includes(selectedSourceOption)
      ? selectedSourceOption
      : null

  function selectGridField(segmentIndex: number, fieldNumber: number) {
    const sourceGridRow = sourceGridRows.find(
      (row) => row.segment.index === segmentIndex,
    )
    const sourceOptionsForField =
      sourceGridRow?.sourceOptionsByFieldNumber.get(fieldNumber) ?? []
    const entireFieldOption = sourceOptionsForField.find(
      (sourceOption) =>
        sourceOption.source.repetition === undefined &&
        sourceOption.source.component === undefined &&
        sourceOption.source.subComponent === undefined,
    )

    setSelectedSegmentIndex(segmentIndex)
    setSelectedFieldNumber(fieldNumber)
    setSelectedSourceOption(
      entireFieldOption ?? sourceOptionsForField[0] ?? null,
    )
  }

  function findFieldNumber() {
    const requestedFieldNumber = Number(fieldNumberToFind)

    if (
      !Number.isInteger(requestedFieldNumber) ||
      requestedFieldNumber < 1 ||
      requestedFieldNumber > largestFieldNumber
    ) {
      return
    }

    const fieldHeader =
      tableContainerReference.current?.querySelector<HTMLElement>(
        `[data-grid-field-number="${requestedFieldNumber}"]`,
      )

    fieldHeader?.scrollIntoView?.({ block: "nearest", inline: "center" })

    if (selectedSourceGridRow?.fieldsByNumber.has(requestedFieldNumber)) {
      selectGridField(selectedSegmentIndex, requestedFieldNumber)
    }
  }

  function updateSearchText(nextSearchText: string) {
    setSearchText(nextSearchText)
    const requestedCoordinate = parseSourceGridCoordinate(nextSearchText)
    if (!requestedCoordinate) return

    setSegmentNameFilter("")
    setMessageRowNumberFilter("")
    setFieldNumberToFind(String(requestedCoordinate.fieldNumber))

    const matchingSourceGridRow = sourceGridRows.find(
      (sourceGridRow) =>
        sourceGridRow.segment.name === requestedCoordinate.segmentName &&
        (requestedCoordinate.messageRowNumber === null ||
          sourceGridRow.messageRowNumber ===
            requestedCoordinate.messageRowNumber) &&
        sourceGridRow.fieldsByNumber.has(requestedCoordinate.fieldNumber),
    )
    if (!matchingSourceGridRow) return

    const requestedSourcePath = buildSourcePath({
      segment: requestedCoordinate.segmentName,
      field: requestedCoordinate.fieldNumber,
      repetition: requestedCoordinate.repetitionNumber,
      component: requestedCoordinate.componentNumber,
      subComponent: requestedCoordinate.subComponentNumber,
    })
    const matchingSourceOption =
      matchingSourceGridRow.sourceOptionsByFieldNumber
        .get(requestedCoordinate.fieldNumber)
        ?.find((sourceOption) => sourceOption.path === requestedSourcePath)

    setSelectedSegmentIndex(matchingSourceGridRow.segment.index)
    setSelectedFieldNumber(requestedCoordinate.fieldNumber)
    setSelectedSourceOption(matchingSourceOption ?? null)
    tableContainerReference.current
      ?.querySelector<HTMLElement>(
        `[data-grid-field-number="${requestedCoordinate.fieldNumber}"]`,
      )
      ?.scrollIntoView?.({ block: "nearest", inline: "center" })
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="grid gap-3 border-b bg-muted/20 px-5 py-4 sm:grid-cols-[minmax(110px,1fr)_90px_90px_minmax(180px,2fr)]">
        <Field>
          <FieldLabel htmlFor="grid-segment-filter">Segment</FieldLabel>
          <select
            id="grid-segment-filter"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={segmentNameFilter}
            onChange={(event) => setSegmentNameFilter(event.target.value)}
          >
            <option value="">All segments</option>
            {segmentNames.map((segmentName) => (
              <option key={segmentName} value={segmentName}>
                {segmentName}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="grid-message-row">Message row</FieldLabel>
          <Input
            id="grid-message-row"
            type="number"
            min={1}
            placeholder="Any"
            value={messageRowNumberFilter}
            onChange={(event) => setMessageRowNumberFilter(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="grid-field-number">Go to field</FieldLabel>
          <Input
            id="grid-field-number"
            type="number"
            min={1}
            max={largestFieldNumber}
            placeholder="Field"
            value={fieldNumberToFind}
            onChange={(event) => setFieldNumberToFind(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") findFieldNumber()
            }}
            onBlur={findFieldNumber}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="grid-value-search">
            Find value or path
          </FieldLabel>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="grid-value-search"
              className="pl-8"
              placeholder="PID(row 2) × 5.1 or Lopez"
              value={searchText}
              onChange={(event) => updateSearchText(event.target.value)}
            />
          </div>
        </Field>
        <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-4">
          <input
            type="checkbox"
            checked={showEmptyFields}
            onChange={(event) => setShowEmptyFields(event.target.checked)}
          />
          Show empty fields
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-2 text-xs text-muted-foreground">
        <span>
          {matchingSourceGridRows.length} message{" "}
          {matchingSourceGridRows.length === 1 ? "row" : "rows"}
        </span>
        {matchingSourceGridRows.length > renderedSourceGridRows.length ? (
          <span>
            Showing the first {MAX_RENDERED_MESSAGE_ROWS}; filter to narrow the
            grid
          </span>
        ) : (
          <span>Field numbers follow the HL7 segment</span>
        )}
      </div>

      <div
        ref={tableContainerReference}
        className="max-h-[38vh] min-w-0 max-w-full overflow-auto border-y"
      >
        <Table className="w-max min-w-full text-xs">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="sticky left-0 z-20 w-16 bg-muted">
                Row
              </TableHead>
              <TableHead className="sticky left-16 z-20 w-28 bg-muted">
                Segment
              </TableHead>
              {fieldNumbers.map((fieldNumber) => (
                <TableHead
                  key={fieldNumber}
                  data-grid-field-number={fieldNumber}
                  className="min-w-36"
                >
                  Field {fieldNumber}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderedSourceGridRows.map((sourceGridRow) => (
              <TableRow
                key={sourceGridRow.segment.index}
                data-state={
                  selectedSegmentIndex === sourceGridRow.segment.index
                    ? "selected"
                    : undefined
                }
              >
                <TableCell className="sticky left-0 z-10 w-16 bg-background font-mono">
                  {sourceGridRow.messageRowNumber}
                </TableCell>
                <TableCell className="sticky left-16 z-10 w-28 bg-background">
                  <span className="font-medium">
                    {sourceGridRow.segment.name}
                  </span>
                  <span className="ml-1 text-muted-foreground">
                    #{sourceGridRow.segmentOccurrenceNumber}
                  </span>
                </TableCell>
                {fieldNumbers.map((fieldNumber) => {
                  const sourceField =
                    sourceGridRow.fieldsByNumber.get(fieldNumber)
                  const sourceOptionsForField =
                    sourceGridRow.sourceOptionsByFieldNumber.get(fieldNumber) ??
                    []
                  const fieldIsSelected =
                    selectedSegmentIndex === sourceGridRow.segment.index &&
                    selectedFieldNumber === fieldNumber

                  return (
                    <TableCell
                      key={fieldNumber}
                      className="min-w-36 max-w-36 p-1"
                    >
                      {sourceField &&
                      (sourceField.raw !== "" || showEmptyFields) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={fieldIsSelected ? "secondary" : "ghost"}
                          className="w-full justify-start font-mono text-xs"
                          aria-label={`${sourceGridRow.segment.name} message row ${sourceGridRow.messageRowNumber}, field ${fieldNumber}: ${sourceField.raw || "empty"}`}
                          aria-pressed={fieldIsSelected}
                          disabled={sourceOptionsForField.length === 0}
                          onClick={() =>
                            selectGridField(
                              sourceGridRow.segment.index,
                              fieldNumber,
                            )
                          }
                        >
                          <span className="truncate">
                            {sourceField.raw || "Empty"}
                          </span>
                        </Button>
                      ) : (
                        <span className="px-2 text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {matchingSourceGridRows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No message rows match these filters.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            Selected cell
          </p>
          <p className="mt-1 font-medium">
            {selectedSourceGridRow
              ? `${selectedSourceGridRow.segment.name}(row ${selectedSourceGridRow.messageRowNumber}) × field ${selectedFieldNumber}`
              : "Choose a field in the grid"}
          </p>
          {selectedSourceGridRow ? (
            <p className="text-xs text-muted-foreground">
              Message row {selectedSourceGridRow.messageRowNumber} ·{" "}
              {selectedSourceGridRow.segment.name} occurrence{" "}
              {selectedSourceGridRow.segmentOccurrenceNumber} ·{" "}
              {getSourceDisplayLabel(
                `${selectedSourceGridRow.segment.name}-${selectedFieldNumber}`,
              )}
            </p>
          ) : null}
          <div className="mt-3 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Raw field</p>
            <p className="mt-1 break-all font-mono text-xs">
              {selectedField?.raw || "(empty)"}
            </p>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            Choose a source within this field
          </p>
          {selectedField && selectedField.repetitions.length > 1 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              An unnumbered field reads its first repetition. Choose [2] for the
              second repetition.
            </p>
          ) : null}
          <div className="mt-2 grid max-h-48 gap-1.5 overflow-y-auto">
            {availableSourceOptions.map((sourceOption) => {
              const sourceIsSelected =
                visibleSelectedSourceOption?.segment.index ===
                  sourceOption.segment.index &&
                visibleSelectedSourceOption.path === sourceOption.path

              return (
                <Button
                  key={`${sourceOption.segment.index}:${sourceOption.path}`}
                  type="button"
                  variant={sourceIsSelected ? "secondary" : "outline"}
                  className="h-auto w-full justify-start py-2 text-left"
                  aria-pressed={sourceIsSelected}
                  onClick={() => setSelectedSourceOption(sourceOption)}
                >
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-mono text-xs">
                      {formatGridCoordinate(sourceOption)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {sourceOption.path} ·{" "}
                      {getSourceDisplayLabel(sourceOption.path)}
                    </span>
                    <span className="w-full truncate font-normal">
                      {sourceOption.previewValue || "(empty)"}
                    </span>
                  </span>
                </Button>
              )
            })}
            {availableSourceOptions.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                {selectedField
                  ? "This field is empty. Turn on Show empty fields to inspect it."
                  : "Choose a populated field in the grid."}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-5 py-3">
        <p className="text-xs text-muted-foreground">
          {visibleSelectedSourceOption
            ? `Selected: ${formatGridCoordinate(visibleSelectedSourceOption)} · ${visibleSelectedSourceOption.path}`
            : "Select a source to preview it in the review panel."}
        </p>
        <Button
          type="button"
          size="sm"
          disabled={!visibleSelectedSourceOption}
          onClick={() => {
            if (visibleSelectedSourceOption)
              onChooseSource(visibleSelectedSourceOption)
          }}
        >
          Preview this source
        </Button>
      </div>
    </div>
  )
}
