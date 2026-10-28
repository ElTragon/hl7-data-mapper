import type { Hl7Item, ValidationIssue } from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import { applySupportedAction } from "./apply-supported-action.js"
import { getTraceStatus } from "./execution-status.js"
import { repeatedItems } from "./repeated-inputs.js"
import { readItemInput } from "./read-item-input.js"
import {
  hasSupportedAction,
  isPendingTransform,
} from "./supported-transforms.js"
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
  const items = repeatedItems(item, parsedMessage)
  const inputs = items.map((entry) =>
    readItemInput(entry, parsedMessage, itemOutputs),
  )
  const input = {
    values: inputs.flatMap((entry) => entry.values),
    sourceReads: inputs.flatMap((entry) => entry.sourceReads),
  }
  const issues: ValidationIssue[] = []
  const pendingTransform = isPendingTransform(item)
  const unsupportedAction = !pendingTransform && !hasSupportedAction(item)
  const outputValue =
    pendingTransform || unsupportedAction
      ? null
      : items.length === 1
        ? applySupportedAction(
            items[0]!,
            inputs[0]!.values,
            inputs[0]!.sourceReads,
          )
        : items.flatMap((entry, index) =>
            applySupportedAction(
              entry,
              inputs[index]!.values,
              inputs[index]!.sourceReads,
            ),
          )

  if (unsupportedAction) {
    issues.push({
      code: "unsupported-action",
      severity: "error",
      message: `Action "${item.action}" is not implemented for "${item.label}".`,
      fieldKey: item.targetPath,
      section: item.section,
      source: item.sources[0] ?? null,
    })
  }

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

  if (
    item.required &&
    isMissingValue(outputValue) &&
    !pendingTransform &&
    !unsupportedAction
  ) {
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
