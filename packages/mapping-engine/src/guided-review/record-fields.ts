import {
  normalizedPathKind,
  type ReviewableField,
} from "@hl7-data-mapper/contracts"
import type { MappingExecutionTraceEntry } from "../execution/types.js"

export function recordFields(
  field: ReviewableField,
  recordSources?: MappingExecutionTraceEntry["recordSources"],
): ReviewableField[] {
  if (!Array.isArray(field.value)) return [field]
  const fields: ReviewableField[] = []
  function visit(value: unknown, path: string) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`))
    } else if (value !== null && typeof value === "object") {
      for (const [key, entry] of Object.entries(value))
        visit(entry, `${path}.${key}`)
    } else {
      const recordPath = Object.keys(recordSources ?? {})
        .filter((key) => path.startsWith(`${key}.`))
        .sort((a, b) => b.length - a.length)[0]
      const candidates = recordPath
        ? recordSources![recordPath]!.map((read) => ({
            source: read.source,
            rawSegment: read.rawSegment,
            previewValue: read.value,
            reason: `Source read for "${field.label}".`,
          }))
        : []
      const validation = field.validation.filter(
        (issue) => !issue.path || issue.path === path,
      )
      fields.push({
        ...field,
        id: `${field.id}:${path}`,
        normalizedPath: path,
        label: `${field.label}: ${recordLabel(path.slice(field.normalizedPath.length))}`,
        value: value ?? null,
        validation,
        warnings: validation
          .filter((issue) => issue.severity === "warning")
          .map((issue) => issue.message),
        primarySource: null,
        sourceCandidates: candidates,
        sources: candidates.map((candidate) => candidate.source),
        rawSegment:
          [
            ...new Set(
              candidates
                .map((candidate) => candidate.rawSegment)
                .filter(Boolean),
            ),
          ].join("\n") || null,
        // Only schema-defined string leaves accept scalar source corrections.
        hl7ItemId:
          normalizedPathKind(path) === "string" ? field.hl7ItemId : null,
      })
    }
  }
  visit(field.value, field.normalizedPath)
  return [field, ...fields]
}

function recordLabel(path: string): string {
  return path
    .replace(/\[(\d+)\]/g, (_, index: string) => `.Record ${Number(index) + 1}`)
    .split(".")
    .filter(Boolean)
    .map((part) => {
      const words = part.replace(/([a-z])([A-Z])/g, "$1 $2")
      return words.charAt(0).toUpperCase() + words.slice(1)
    })
    .join(" · ")
}
