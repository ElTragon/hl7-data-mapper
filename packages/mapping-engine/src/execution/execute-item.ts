import type { Hl7Item, ValidationIssue } from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import { getOrderGroups } from "../source-lookup.js"
import { mapSpecimenFromSourceValues } from "./transforms/order.js"
import { applySupportedAction } from "./apply-supported-action.js"
import { getTraceStatus } from "./execution-status.js"
import { repeatedItems } from "./repeated-inputs.js"
import { readItemInput } from "./read-item-input.js"
import {
  hasSupportedAction,
  isPendingTransform,
} from "./supported-transforms.js"
import type { MappingExecutionTraceEntry } from "./types.js"
import { temporalIssues } from "./temporal-validation.js"
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
  const recordSources: Record<
    string,
    MappingExecutionTraceEntry["sourceReads"]
  > = {}
  let recordCount = 0
  const pendingTransform = isPendingTransform(item)
  const unsupportedAction = !pendingTransform && !hasSupportedAction(item)
  function applyInput(entry: Hl7Item, index: number): unknown {
    const entryInput = inputs[index]!
    const output = applySupportedAction(
      entry,
      entryInput.values,
      entryInput.sourceReads,
      parsedMessage.delimiters,
    )
    const recordPath = `${item.targetPath}[${recordCount}]`
    const initialTemporalIssues = temporalIssues(
      entry,
      entryInput.values,
      parsedMessage.delimiters,
      recordPath,
    )
    issues.push(
      ...initialTemporalIssues.filter(
        (issue) =>
          entry.transform?.name !== "mapOrcOrderGroups" ||
          issue.source?.segment !== "SPM",
      ),
    )
    if (Array.isArray(output)) {
      output.forEach((_, offset) => {
        recordSources[`${item.targetPath}[${recordCount + offset}]`] =
          entryInput.sourceReads
      })
      recordCount += output.length
    }
    if (entry.transform?.name !== "mapOrcOrderGroups" || !Array.isArray(output))
      return output
    const explicitSpecimen = item.sources.some(
      (source) => source.segment === "SPM" && source.segmentIndex != null,
    )
    const orcIndex = entryInput.sourceReads.find(
      (read) => read.source.segment === "ORC",
    )?.segmentIndex
    const group = getOrderGroups(parsedMessage).find(
      (group) => group.orc.index === orcIndex,
    )
    if (explicitSpecimen || !group) {
      recordSources[`${recordPath}.specimens[0]`] =
        entryInput.sourceReads.filter((read) => read.source.segment === "SPM")
      issues.push(
        ...initialTemporalIssues.filter(
          (issue) => issue.source?.segment === "SPM",
        ),
      )
      return output
    }
    let specimenCount = 0
    const specimens = group.spm.flatMap((segment, specimenIndex) => {
      const scoped = {
        ...entry,
        sources: entry.sources.map((source) =>
          source.segment === "SPM"
            ? { ...source, segmentIndex: segment.index }
            : source,
        ),
      }
      const read = readItemInput(scoped, parsedMessage, itemOutputs)
      if (specimenIndex > 0) {
        const specimenReads = read.sourceReads.filter(
          (source) => source.source.segment === "SPM",
        )
        input.sourceReads.push(...specimenReads)
        input.values.push(...specimenReads.map((source) => source.value))
      }
      const specimen = mapSpecimenFromSourceValues(
        read.values.slice(13),
        parsedMessage.delimiters,
      )
      if (specimen) {
        const specimenPath = `${recordPath}.specimens[${specimenCount++}]`
        recordSources[specimenPath] = read.sourceReads.filter(
          (source) => source.source.segment === "SPM",
        )
        issues.push(
          ...temporalIssues(
            scoped,
            read.values,
            parsedMessage.delimiters,
            recordPath,
            specimenPath,
          ).filter((issue) => issue.source?.segment === "SPM"),
        )
      }
      return specimen ? [specimen] : []
    })
    return output.map((order) => ({ ...order, specimens }))
  }
  const outputValue =
    pendingTransform || unsupportedAction
      ? null
      : items.length === 1
        ? applyInput(items[0]!, 0)
        : items.flatMap(applyInput)

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
    !unsupportedAction &&
    !issues.some((issue) => issue.code === "invalid-temporal-value")
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
    recordSources,
    sourceExpectations: item.sourceExpectations,
    inputValues: input.values,
    outputValue,
    validationIssues: issues,
  }
}
