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
      fields.push({
        ...field,
        id: `${field.id}:${path}`,
        normalizedPath: path,
        label: `${field.label}: ${recordLabel(path.slice(field.normalizedPath.length))}`,
        value: value ?? null,
        primarySource: null,
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
