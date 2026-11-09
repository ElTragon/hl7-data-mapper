import { ArrowDown, ArrowUp, X } from "lucide-react"

import type { SourceReference } from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"
import { readSource } from "@hl7-data-mapper/mapping-engine"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { formatSourceReferenceCoordinate } from "./source-grid-model"

export function SourceRecipeEditor({
  parsedMessage,
  sources,
  joinSeparator,
  onJoinSeparatorChange,
  onMoveSource,
  onRemoveSource,
  onApply,
}: {
  readonly parsedMessage: ParsedHl7Message
  readonly sources: readonly SourceReference[]
  readonly joinSeparator: string
  readonly onJoinSeparatorChange: (separator: string) => void
  readonly onMoveSource: (sourceIndex: number, direction: -1 | 1) => void
  readonly onRemoveSource: (sourceIndex: number) => void
  readonly onApply: () => void
}) {
  const sourceReads = sources.map((sourceReference) =>
    readSource(parsedMessage, sourceReference),
  )
  const everySourceHasValue = sourceReads.every(
    (sourceRead) =>
      sourceRead.status === "found" && Boolean(sourceRead.value?.trim()),
  )
  const combinedValue = everySourceHasValue
    ? sourceReads.map((sourceRead) => sourceRead.value).join(joinSeparator)
    : null

  return (
    <section
      aria-label="Combine HL7 sources"
      className="border-b bg-muted/20 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Combine HL7 sources</p>
        <span className="text-xs text-muted-foreground">
          {sources.length} selected
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Add parts from the grid or results, then put them in report order.
      </p>

      {sources.length > 0 ? (
        <ol className="mt-3 flex flex-col gap-2">
          {sources.map((sourceReference, sourceIndex) => {
            const sourceRead = sourceReads[sourceIndex]

            return (
              <li
                key={`${sourceReference.path}:${sourceReference.segmentIndex ?? "first"}:${sourceReference.literalSplit?.separator ?? ""}:${sourceReference.literalSplit?.partNumber ?? ""}`}
                className="rounded-md border bg-background p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-mono text-xs">
                      {sourceIndex + 1}.{" "}
                      {formatSourceReferenceCoordinate(sourceReference)}
                    </p>
                    {sourceReference.literalSplit ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Split on{" "}
                        {JSON.stringify(sourceReference.literalSplit.separator)}
                        , part {sourceReference.literalSplit.partNumber}
                      </p>
                    ) : null}
                    <p className="mt-1 break-words text-xs">
                      {sourceRead?.value ?? sourceRead?.status ?? "Unavailable"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Move source ${sourceIndex + 1} up`}
                      disabled={sourceIndex === 0}
                      onClick={() => onMoveSource(sourceIndex, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Move source ${sourceIndex + 1} down`}
                      disabled={sourceIndex === sources.length - 1}
                      onClick={() => onMoveSource(sourceIndex, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Remove source ${sourceIndex + 1}`}
                      onClick={() => onRemoveSource(sourceIndex)}
                    >
                      <X />
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      ) : null}

      <Field className="mt-3">
        <FieldLabel htmlFor="combined-source-separator">Join with</FieldLabel>
        <Input
          id="combined-source-separator"
          value={joinSeparator}
          onChange={(event) => onJoinSeparatorChange(event.target.value)}
          placeholder="Leave blank to join directly"
          maxLength={32}
        />
        <FieldDescription>
          Enter the exact text to place between selected parts.
        </FieldDescription>
      </Field>

      {sources.length > 0 ? (
        <div className="mt-3 rounded-md border bg-background p-2">
          <p className="text-xs text-muted-foreground">Combined preview</p>
          <p className="mt-1 break-words text-sm font-medium">
            {combinedValue ?? "One or more selected parts are unavailable."}
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={sources.length < 2 || !everySourceHasValue}
          onClick={onApply}
        >
          Use combined value
        </Button>
      </div>
    </section>
  )
}
