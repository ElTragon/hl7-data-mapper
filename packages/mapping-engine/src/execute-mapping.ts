import {
  canExecuteClientProfile,
  ClientProfileSchema,
  createValidationSummary,
  sortHl7ItemsForExecution,
  type ClientProfile,
  type Hl7Item,
  type NormalizedField,
  type SourceExpectation,
  type SourceReference,
  type ValidationIssue,
  type ValidationSummary,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import {
  mapCoverageArrayFromSourceValues,
  mapGuarantorFromSourceValues,
} from "./execution/transforms/coverage.js"
import {
  mapAddressArrayFromSourceValues,
  mapPersonNameFromSourceValues,
  mapPreferredIdentifierFromSourceReads,
  mapTelecomArrayFromSourceValues,
} from "./execution/transforms/patient.js"
import { mapLabOrderArrayFromSourceValues } from "./execution/transforms/order.js"
import {
  normalizeDate,
  normalizeTimestamp,
} from "./execution/transforms/temporal.js"
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
  readonly sourceExpectations: readonly SourceExpectation[]
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
    : applySupportedAction(item, input.values, input.sourceReads)

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
    sourceExpectations: item.sourceExpectations,
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

function applySupportedAction(
  item: Hl7Item,
  inputValues: readonly unknown[],
  sourceReads: readonly Hl7SourceRead[],
) {
  const firstValue = inputValues[0]

  if (item.transform?.name === "preferIdentifierType") {
    return mapPreferredIdentifierFromSourceReads(item, sourceReads)
  }

  if (item.transform?.name === "mapXpnName") {
    return mapPersonNameFromSourceValues(item, inputValues)
  }

  if (item.transform?.name === "mapRepeatingXadAddresses") {
    return mapAddressArrayFromSourceValues(inputValues)
  }

  if (item.transform?.name === "mapRepeatingXtnTelecom") {
    return mapTelecomArrayFromSourceValues(inputValues)
  }

  if (item.transform?.name === "mapRepeatingIn1Coverage") {
    return mapCoverageArrayFromSourceValues(inputValues)
  }

  if (item.transform?.name === "mapOptionalGt1Guarantor") {
    return mapGuarantorFromSourceValues(inputValues)
  }

  if (item.transform?.name === "mapOrcOrderGroups") {
    return mapLabOrderArrayFromSourceValues(inputValues)
  }

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

  return !SUPPORTED_TRANSFORMS.has(item.transform.name)
}

const SUPPORTED_TRANSFORMS = new Set([
  "mustEqual",
  "preferIdentifierType",
  "mapXpnName",
  "mapRepeatingXadAddresses",
  "mapRepeatingXtnTelecom",
  "mapRepeatingIn1Coverage",
  "mapOptionalGt1Guarantor",
  "mapOrcOrderGroups",
])

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
