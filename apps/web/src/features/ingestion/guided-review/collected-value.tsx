import { cn } from "@/lib/utils"

type CollectedValueProps = {
  readonly value: unknown
  readonly density: "compact" | "comfortable"
}

type ValueGroup = {
  readonly title?: string
  readonly rows: readonly ValueRow[]
}

type ValueRow = {
  readonly label: string
  readonly value: string
}

export function CollectedValue({ value, density }: CollectedValueProps) {
  const groups = buildValueGroups(value)

  if (groups.length === 0) {
    return (
      <p className="break-words font-mono text-sm text-muted-foreground">
        Unavailable
      </p>
    )
  }

  if (groups.length === 1 && groups[0]?.rows.length === 1) {
    return (
      <p className="break-words text-sm leading-6 text-foreground">
        {groups[0].rows[0]?.value}
      </p>
    )
  }

  return (
    <div className="grid min-w-0 gap-2 text-sm">
      {groups.map((group, groupIndex) => (
        <div
          key={`${group.title ?? "value"}-${groupIndex}`}
          className="min-w-0"
        >
          {group.title ? (
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {group.title}
            </p>
          ) : null}
          <dl
            className={cn(
              "grid min-w-0 gap-x-3 gap-y-1",
              density === "compact"
                ? "grid-cols-[92px_minmax(0,1fr)]"
                : "grid-cols-[120px_minmax(0,1fr)]",
            )}
          >
            {group.rows.map((row, rowIndex) => (
              <div
                key={`${groupIndex}-${rowIndex}-${row.label}`}
                className="contents"
              >
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere] text-sm leading-5 text-foreground">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

function buildValueGroups(value: unknown): ValueGroup[] {
  if (isEmptyValue(value)) {
    return []
  }

  if (typeof value !== "object") {
    return [
      {
        rows: [{ label: "Value", value: String(value) }],
      },
    ]
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => {
      if (isEmptyValue(entry)) {
        return []
      }

      const rows = valueToRows(entry)

      if (rows.length === 0) {
        return []
      }

      return [
        {
          title: value.length > 1 ? `Record ${index + 1}` : undefined,
          rows,
        },
      ]
    })
  }

  const rows = valueToRows(value)

  return rows.length > 0 ? [{ rows }] : []
}

function valueToRows(value: unknown): ValueRow[] {
  if (isEmptyValue(value)) {
    return []
  }

  if (typeof value !== "object") {
    return [{ label: "Value", value: String(value) }]
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      valueToRows(entry).map((row) => ({
        label: `${index + 1} ${row.label}`,
        value: row.value,
      })),
    )
  }

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, entry]) => {
      if (isEmptyValue(entry)) {
        return []
      }

      if (typeof entry === "object" && !Array.isArray(entry)) {
        return valueToRows(entry).map((row) => ({
          label: `${humanizeKey(key)} ${row.label}`,
          value: row.value,
        }))
      }

      if (Array.isArray(entry)) {
        return entry.flatMap((arrayEntry, index) =>
          valueToRows(arrayEntry).map((row) => ({
            label: `${humanizeKey(key)} ${index + 1} ${row.label}`,
            value: row.value,
          })),
        )
      }

      return [{ label: humanizeKey(key), value: String(entry) }]
    },
  )
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  )
}
