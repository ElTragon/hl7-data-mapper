import type { Hl7Item, ValidationIssue } from "@hl7-data-mapper/contracts"
import type { Hl7Delimiters } from "@hl7-data-mapper/hl7-parser"
import {
  createDatatypeMappers,
  stringOrNull,
} from "./transforms/hl7-datatypes.js"
import { parseTemporal } from "./transforms/temporal.js"

export function temporalIssues(
  item: Hl7Item,
  values: readonly unknown[],
  delimiters: Hl7Delimiters,
): ValidationIssue[] {
  const candidates: {
    value: unknown
    sourceIndex: number
    timestamp: boolean
  }[] = []
  if (
    item.action === "normalize_date" ||
    item.action === "normalize_timestamp"
  ) {
    candidates.push({
      value: values[0],
      sourceIndex: 0,
      timestamp: item.action === "normalize_timestamp",
    })
  } else if (item.transform?.name === "mapOptionalGt1Guarantor") {
    candidates.push({
      value: stringOrNull(values[4]),
      sourceIndex: 4,
      timestamp: false,
    })
  } else if (item.transform?.name === "mapOrcOrderGroups") {
    for (const sourceIndex of [4, 6, 7, 18])
      candidates.push({
        value: stringOrNull(values[sourceIndex]),
        sourceIndex,
        timestamp: true,
      })
    const { component } = createDatatypeMappers(delimiters)
    for (const index of [1, 2])
      candidates.push({
        value: component(stringOrNull(values[17]), index),
        sourceIndex: 17,
        timestamp: true,
      })
  }
  return candidates.flatMap<ValidationIssue>(
    ({ value, sourceIndex, timestamp }) => {
      if (value == null || value === "") return []
      const parsed = parseTemporal(value)
      const common = {
        fieldKey: item.targetPath,
        section: item.section,
        source: item.sources[sourceIndex] ?? null,
      }
      if (!parsed)
        return [
          {
            ...common,
            code: "invalid-temporal-value",
            severity: "error" as const,
            message: `Invalid calendar date, time, precision, or timezone offset for "${item.label}". Check the source evidence.`,
          },
        ]
      if (
        timestamp &&
        ["hour", "minute", "second", "fraction"].includes(parsed.precision) &&
        parsed.offset === null
      ) {
        return [
          {
            ...common,
            code: "missing-timezone",
            severity: "warning" as const,
            message: `The timestamp for "${item.label}" has no timezone offset. Its local time and precision were preserved; UTC was not assumed.`,
          },
        ]
      }
      return []
    },
  )
}
