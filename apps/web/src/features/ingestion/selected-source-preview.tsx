import { FileSearch } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { getSourceDisplayLabel } from "./source-display-metadata"
import type { SourceOption } from "./source-search"

export function SelectedSourcePreview({
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
