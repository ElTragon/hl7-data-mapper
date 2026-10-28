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
  recordPath = `${item.targetPath}[0]`,
  specimenPath = `${recordPath}.specimens[0]`,
): ValidationIssue[] {
  const candidates: {
    value: unknown
    sourceIndex: number
    timestamp: boolean
    path: string
  }[] = []
  if (
    item.action === "normalize_date" ||
    item.action === "normalize_timestamp"
  ) {
    candidates.push({
      value: values[0],
      sourceIndex: 0,
      timestamp: item.action === "normalize_timestamp",
      path: item.targetPath,
    })
  } else if (item.transform?.name === "mapOptionalGt1Guarantor") {
    candidates.push({
      value: stringOrNull(values[4]),
      sourceIndex: 4,
      timestamp: false,
      path: `${item.targetPath}.dateOfBirth`,
    })
  } else if (item.transform?.name === "mapOrcOrderGroups") {
    for (const [sourceIndex, path] of [
      [4, `${recordPath}.transactionAt`],
      [6, `${recordPath}.timing.startAt`],
      [7, `${recordPath}.timing.endAt`],
      [18, `${specimenPath}.receivedAt`],
    ] as const)
      candidates.push({
        value: stringOrNull(values[sourceIndex]),
        sourceIndex,
        timestamp: true,
        path,
      })
    const { component } = createDatatypeMappers(delimiters)
    for (const index of [1, 2])
      candidates.push({
        value: component(stringOrNull(values[17]), index),
        sourceIndex: 17,
        timestamp: true,
        path: `${specimenPath}.collected.${index === 1 ? "startAt" : "endAt"}`,
      })
  }
  return candidates.flatMap<ValidationIssue>(
    ({ value, sourceIndex, timestamp, path }) => {
      if (value == null || value === "") return []
      const parsed = parseTemporal(value)
      const common = {
        fieldKey: item.targetPath,
        path,
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
