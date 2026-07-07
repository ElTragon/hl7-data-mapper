import {
  canExecuteClientProfile,
  ClientProfileSchema,
  createValidationSummary,
  sortHl7ItemsForExecution,
  type ClientProfile,
  type Hl7Item,
  type NormalizedField,
  type SourceReference,
  type ValidationIssue,
  type ValidationSummary,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import { readSource, type Hl7SourceRead } from "./source-lookup.js"

export type MappingExecutionStatus =
  "completed" | "completed_with_warnings" | "error" | "pending_transform"

export type MappingExecutionTraceEntry = {
  readonly itemId: string
  readonly sequence: number
  readonly targetPath: string
  readonly status: MappingExecutionStatus
  readonly sourcesRead: readonly SourceReference[]
  readonly sourceReads: readonly Hl7SourceRead[]
  readonly inputValues: readonly unknown[]
  readonly outputValue: unknown
  readonly validationIssues: readonly ValidationIssue[]
}

export type MappingExecutionResult = {
  readonly profile: {
    readonly clientId: string
    readonly profileId: string
    readonly profileVersion: number
    readonly status: ClientProfile["status"]
  }
  readonly normalizedDraft: Record<string, unknown>
  readonly normalizedFields: readonly NormalizedField<unknown>[]
  readonly validation: ValidationSummary
  readonly executionTrace: readonly MappingExecutionTraceEntry[]
}

export type ExecuteMappingInput = {
  readonly parsedMessage: ParsedHl7Message
  readonly profile: ClientProfile
}

export function executeMapping({
  parsedMessage,
  profile,
}: ExecuteMappingInput): MappingExecutionResult {
  const parsedProfile = ClientProfileSchema.parse(profile)

  if (!canExecuteClientProfile(parsedProfile)) {
    throw new Error(
      `Client profile "${parsedProfile.profileId}" version ${parsedProfile.profileVersion} cannot be executed while status is "${parsedProfile.status}".`,
    )
  }

  const normalizedDraft: Record<string, unknown> = {}
  const fields: NormalizedField<unknown>[] = []
  const trace: MappingExecutionTraceEntry[] = []
  const issues: ValidationIssue[] = []
  const itemOutputs = new Map<string, unknown>()

  for (const item of sortHl7ItemsForExecution(parsedProfile.itemSet.items)) {
    const itemResult = executeItem({
      item,
      parsedMessage,
      itemOutputs,
    })

    itemOutputs.set(item.id, itemResult.outputValue)
    issues.push(...itemResult.validationIssues)
    trace.push(itemResult)

    setValueAtPath(normalizedDraft, item.targetPath, itemResult.outputValue)

    fields.push({
      key: item.targetPath,
      label: item.label,
      value: itemResult.outputValue,
      sources: item.sources,
      primarySource: item.sources[0] ?? null,
      transformHistory: item.transform
        ? [
            {
              name: item.transform.name,
              description: item.transform.description,
            },
          ]
        : [],
      validation: itemResult.validationIssues,
      reviewStatus: "unreviewed",
      warnings: itemResult.validationIssues
        .filter((issue) => issue.severity === "warning")
        .map((issue) => issue.message),
    })
  }

  return {
    profile: {
      clientId: parsedProfile.clientId,
      profileId: parsedProfile.profileId,
      profileVersion: parsedProfile.profileVersion,
      status: parsedProfile.status,
    },
    normalizedDraft,
    normalizedFields: fields,
    validation: createValidationSummary(issues),
    executionTrace: trace,
  }
}

function executeItem({
  item,
  parsedMessage,
  itemOutputs,
}: {
  item: Hl7Item
  parsedMessage: ParsedHl7Message
  itemOutputs: ReadonlyMap<string, unknown>
}): MappingExecutionTraceEntry {
  const input = readItemInput(item, parsedMessage, itemOutputs)
  const issues: ValidationIssue[] = []
  const pendingTransform = isPendingTransform(item)
  const outputValue = pendingTransform
    ? null
    : applySupportedAction(item, input.values)

  if (pendingTransform) {
    issues.push({
      code: "pending-transform",
      severity: "info",
      message: `Transform "${item.transform?.name}" is declared but not implemented in the generic executor yet.`,
      fieldKey: item.targetPath,
      section: item.section,
      source: item.sources[0] ?? null,
    })
  }

  if (item.required && isMissingValue(outputValue) && !pendingTransform) {
    issues.push({
      code: "missing-required-value",
      severity: "error",
      message: `Required mapping item "${item.label}" did not produce a value.`,
      fieldKey: item.targetPath,
      section: item.section,
      source: item.sources[0] ?? null,
    })
  }

  if (
    item.action === "validate" &&
    item.transform?.name === "mustEqual" &&
    outputValue !== item.transform.params["expected"]
  ) {
    issues.push({
      code: "unexpected-value",
      severity: "error",
      message: `Expected "${item.label}" to equal "${String(item.transform.params["expected"])}".`,
      fieldKey: item.targetPath,
      section: item.section,
      source: item.sources[0] ?? null,
    })
  }

  const status = getTraceStatus(issues, pendingTransform)

  return {
    itemId: item.id,
    sequence: item.sequence,
    targetPath: item.targetPath,
    status,
    sourcesRead: item.sources,
    sourceReads: input.sourceReads,
    inputValues: input.values,
    outputValue,
    validationIssues: issues,
  }
}

function readItemInput(
  item: Hl7Item,
  parsedMessage: ParsedHl7Message,
  itemOutputs: ReadonlyMap<string, unknown>,
): {
  readonly values: readonly unknown[]
  readonly sourceReads: readonly Hl7SourceRead[]
} {
  if (item.sources.length > 0) {
    const sourceReads = item.sources.map((source) =>
      readSource(parsedMessage, source),
    )

    return {
      values: sourceReads.map((sourceRead) => sourceRead.value),
      sourceReads,
    }
  }

  return {
    values: item.dependsOn.map((dependencyId) => itemOutputs.get(dependencyId)),
    sourceReads: [],
  }
}

function applySupportedAction(item: Hl7Item, inputValues: readonly unknown[]) {
  const firstValue = inputValues[0]

  if (item.action === "default_value") {
    return item.defaultValue ?? null
  }

  if (item.action === "normalize_date") {
    return normalizeDate(firstValue)
  }

  if (item.action === "normalize_timestamp") {
    return normalizeTimestamp(firstValue)
  }

  if (item.action === "join") {
    return inputValues.filter((value) => !isMissingValue(value)).join("")
  }

  if (item.action === "extract" || item.action === "validate") {
    return inputValues.length <= 1 ? (firstValue ?? null) : inputValues
  }

  return firstValue ?? null
}

function isPendingTransform(item: Hl7Item): boolean {
  if (!item.transform) {
    return false
  }

  return !["mustEqual"].includes(item.transform.name)
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8) {
    return null
  }

  const compactDate = value.slice(0, 8)

  if (!/^\d{8}$/.test(compactDate)) {
    return null
  }

  return `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8) {
    return null
  }

  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?([+-]\d{4})?$/,
  )

  if (!match) {
    return null
  }

  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match
  const offset = formatTimezoneOffset(match[7])

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`
}

function formatTimezoneOffset(offset: string | undefined): string {
  if (!offset) {
    return "Z"
  }

  return `${offset.slice(0, 3)}:${offset.slice(3)}`
}

function getTraceStatus(
  issues: readonly ValidationIssue[],
  pendingTransform: boolean,
): MappingExecutionStatus {
  if (issues.some((issue) => issue.severity === "error")) {
    return "error"
  }

  if (pendingTransform) {
    return "pending_transform"
  }

  if (issues.length > 0) {
    return "completed_with_warnings"
  }

  return "completed"
}

function setValueAtPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".")
  let cursor: Record<string, unknown> = target

  for (const [index, part] of parts.entries()) {
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/)
    const key = arrayMatch?.[1] ?? part
    const isLast = index === parts.length - 1

    if (!key) {
      return
    }

    if (arrayMatch) {
      const arrayIndex = Number(arrayMatch[2])
      const existing = cursor[key]
      const array = Array.isArray(existing) ? existing : []
      cursor[key] = array

      if (isLast) {
        array[arrayIndex] = value
        return
      }

      array[arrayIndex] =
        typeof array[arrayIndex] === "object" && array[arrayIndex] !== null
          ? array[arrayIndex]
          : {}
      cursor = array[arrayIndex] as Record<string, unknown>
      continue
    }

    if (isLast) {
      cursor[key] = value
      return
    }

    cursor[key] =
      typeof cursor[key] === "object" && cursor[key] !== null ? cursor[key] : {}
    cursor = cursor[key] as Record<string, unknown>
  }
}

function isMissingValue(value: unknown): boolean {
  return value === null || value === undefined || value === ""
}
