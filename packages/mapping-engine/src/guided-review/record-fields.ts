import type { ReviewableField } from "@hl7-data-mapper/contracts"

export function recordFields(field: ReviewableField): ReviewableField[] {
  if (!Array.isArray(field.value)) return [field]
  const fields: ReviewableField[] = []
  function visit(value: unknown, path: string) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`))
    } else if (value !== null && typeof value === "object") {
      for (const [key, entry] of Object.entries(value))
        visit(entry, `${path}.${key}`)
    } else {
      const recordIndex = Number(
        path.slice(field.normalizedPath.length).match(/^\[(\d+)\]/)?.[1] ?? 0,
      )
      const candidates = candidatesForRecord(field, recordIndex, path)
      fields.push({
        ...field,
        id: `${field.id}:${path}`,
        normalizedPath: path,
        label: `${field.label}: ${recordLabel(path.slice(field.normalizedPath.length))}`,
        value: value ?? null,
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
        // A record's numeric sequence is structural, not a source correction.
        hl7ItemId: typeof value === "number" ? null : field.hl7ItemId,
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

function candidatesForRecord(
  field: ReviewableField,
  index: number,
  path: string,
) {
  const candidates = field.sourceCandidates
  const anchor =
    field.normalizedPath === "labOrders"
      ? "ORC"
      : field.normalizedPath === "coverages"
        ? "IN1"
        : null
  if (!anchor)
    return candidates.filter(
      (candidate) => (candidate.source.repetition ?? 1) === index + 1,
    )
  const anchors = [
    ...new Set(
      candidates
        .filter((candidate) => candidate.source.segment === anchor)
        .map((candidate) => candidate.source.segmentIndex),
    ),
  ]
  const start = anchors[index]
  if (start == null) return candidates
  const end = anchors[index + 1] ?? Infinity
  const scoped = candidates.filter(
    (candidate) =>
      candidate.rawSegment != null &&
      candidate.source.segmentIndex != null &&
      candidate.source.segmentIndex >= start &&
      candidate.source.segmentIndex < end,
  )
  const specimen = path.match(/\.specimens\[(\d+)\]/)
  if (!specimen) return scoped
  const specimenSegments = [
    ...new Set(
      scoped
        .filter((candidate) => candidate.source.segment === "SPM")
        .map((candidate) => candidate.source.segmentIndex),
    ),
  ]
  return scoped.filter(
    (candidate) =>
      candidate.source.segment === "SPM" &&
      candidate.source.segmentIndex === specimenSegments[Number(specimen[1])],
  )
}
