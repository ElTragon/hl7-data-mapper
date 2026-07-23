import { CheckCircle2 } from "lucide-react"

import type { SourceReference } from "@hl7-data-mapper/contracts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import {
  getSegmentLabel,
  getSourceDisplayLabel,
} from "./source-display-metadata"
import {
  getSegmentKey,
  getSourceLevelLabel,
  isSameSource,
  type SourceOption,
  type SourceOptionGroup,
} from "./source-search"
import { getCandidateBlockReason } from "./source-selection-rules"

export function Hl7SourceResults({
  groups,
  query,
  searchError,
  hiddenEmptyCount,
  selectedCandidate,
  currentSource,
  isPersonNameField,
  canApply,
  onSelect,
}: {
  readonly groups: readonly SourceOptionGroup[]
  readonly query: string
  readonly searchError: string | null
  readonly hiddenEmptyCount: number
  readonly selectedCandidate: SourceOption | null
  readonly currentSource: SourceReference | null
  readonly isPersonNameField: boolean
  readonly canApply: boolean
  readonly onSelect: (option: SourceOption) => void
}) {
  return (
    <>
      {searchError ? (
        <p className="border-b px-3 py-3 text-sm text-destructive">
          {searchError}
        </p>
      ) : null}

      <div className="max-h-[420px] overflow-auto">
        {groups.map((group) => (
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
                      !canApply ||
                      option.previewValue === "" ||
                      Boolean(optionBlockReason)
                    }
                    onClick={() => onSelect(option)}
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

        {!searchError && groups.length === 0 ? (
          <NoSourceResults query={query} hiddenEmptyCount={hiddenEmptyCount} />
        ) : null}
      </div>
    </>
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
