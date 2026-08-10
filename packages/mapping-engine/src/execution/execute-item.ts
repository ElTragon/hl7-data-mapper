import type { Hl7Item, ValidationIssue } from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import { applySupportedAction } from "./apply-supported-action.js"
import { getTraceStatus } from "./execution-status.js"
import { readItemInput } from "./read-item-input.js"
import { isPendingTransform } from "./supported-transforms.js"
import type { MappingExecutionTraceEntry } from "./types.js"
import { isMissingValue } from "./value-presence.js"

export type ExecuteItemInput = {
  readonly item: Hl7Item
  readonly parsedMessage: ParsedHl7Message
  readonly itemOutputs: ReadonlyMap<string, unknown>
}

export function executeItem({
  item,
  parsedMessage,
  itemOutputs,
}: ExecuteItemInput): MappingExecutionTraceEntry {
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

  return {
    itemId: item.id,
    sequence: item.sequence,
    targetPath: item.targetPath,
    status: getTraceStatus(issues, pendingTransform),
    sourcesRead: item.sources,
    sourceReads: input.sourceReads,
    sourceExpectations: item.sourceExpectations,
    inputValues: input.values,
    outputValue,
    validationIssues: issues,
  }
}
