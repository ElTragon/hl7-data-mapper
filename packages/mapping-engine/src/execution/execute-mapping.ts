import { collectReviewValidation } from "../guided-review/warning-review-fields.js"
import {
  canExecuteClientProfile,
  ClientProfileSchema,
  createValidationSummary,
  normalizedPathKind,
  sortHl7ItemsForExecution,
  type NormalizedField,
  type ValidationIssue,
} from "@hl7-data-mapper/contracts"

import { executeItem } from "./execute-item.js"
import {
  fingerprintMessage,
  recordAnchors,
  resolveAnchor,
  sameAnchors,
} from "./record-correction-identity.js"
import { setValueAtPath } from "./normalized-path.js"
import type {
  ExecuteMappingInput,
  MappingExecutionResult,
  MappingExecutionTraceEntry,
} from "./types.js"

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
  const overriddenPaths = new Set<string>()

  for (const item of sortHl7ItemsForExecution(parsedProfile.itemSet.items)) {
    const isRecordCorrection = item.dependsOn.some((id) => {
      const parent = parsedProfile.itemSet.items.find(
        (candidate) => candidate.id === id,
      )
      return parent && item.targetPath.startsWith(`${parent.targetPath}[`)
    })
    const invalidRecordTarget =
      isRecordCorrection && normalizedPathKind(item.targetPath) !== "string"
    let targetPath = item.targetPath
    let correctionSource = item.sources[0]
    let identityFailure = false
    if (isRecordCorrection) {
      const identity = item.recordCorrectionIdentity
      const parentTrace = trace.find(
        (entry) => entry.itemId === item.dependsOn[0],
      )
      if (!identity || !parentTrace) {
        identityFailure = true
      } else {
        const suffix = item.targetPath.slice(
          item.targetPath.lastIndexOf("]") + 1,
        )
        const candidates = Object.keys(parentTrace.recordSources ?? {})
          .filter(
            (path) =>
              path.startsWith(parentTrace.targetPath + "[") &&
              (path.match(/\[/g)?.length ?? 0) === identity.records.length,
          )
          .filter((path) => {
            const anchors = recordAnchors(parsedMessage, parentTrace, path)
            return anchors && sameAnchors(anchors, identity.records)
          })
        const replacementIndex = resolveAnchor(
          parsedMessage,
          identity.replacement,
        )
        const changedSegmentMessage =
          [...identity.records, identity.replacement].some(
            (anchor) =>
              anchor.segment === "IN1" ||
              anchor.segment === "ORC" ||
              anchor.segment === "SPM",
          ) &&
          identity.messageFingerprint !==
            fingerprintMessage(parsedMessage.normalizedText)
        if (
          candidates.length !== 1 ||
          replacementIndex == null ||
          !correctionSource ||
          changedSegmentMessage
        ) {
          identityFailure = true
        } else {
          targetPath = `${candidates[0]}${suffix}`
          correctionSource = {
            ...correctionSource,
            segmentIndex: replacementIndex,
          }
        }
      }
    }
    const missingRecord =
      isRecordCorrection &&
      !identityFailure &&
      valueAtPath(normalizedDraft, targetPath) === undefined
    const executionItem =
      isRecordCorrection && !identityFailure
        ? {
            ...item,
            targetPath,
            sources: correctionSource ? [correctionSource] : item.sources,
          }
        : item
    const executed = executeItem({
      item: executionItem,
      parsedMessage,
      itemOutputs,
    })
    const invalidRecordValue =
      isRecordCorrection &&
      executed.outputValue !== null &&
      typeof executed.outputValue !== "string"
    const invalidCorrection = invalidRecordTarget || invalidRecordValue
    const skipWrite = invalidCorrection || missingRecord || identityFailure
    const itemResult: MappingExecutionTraceEntry = skipWrite
      ? {
          ...executed,
          outputValue: null,
          status: "error",
          validationIssues: [
            {
              code: invalidCorrection
                ? "invalid-record-correction"
                : identityFailure
                  ? "unresolved-record-identity"
                  : "missing-record",
              severity: "error",
              fieldKey: item.targetPath,
              section: item.section,
              message: invalidCorrection
                ? `The saved correction for "${item.label}" is incompatible with its field type and was not applied. Remove or replace this correction before completing review.`
                : identityFailure
                  ? `The saved correction for "${item.label}" could not be matched to its original record or source. Review and replace this correction before completing review.`
                  : `The record for "${item.label}" is absent in this message. Review the saved correction.`,
            },
          ],
        }
      : executed

    itemOutputs.set(item.id, itemResult.outputValue)
    issues.push(...itemResult.validationIssues)
    trace.push(itemResult)
    if (!skipWrite)
      setValueAtPath(normalizedDraft, targetPath, itemResult.outputValue)
    if (!skipWrite && isRecordCorrection) overriddenPaths.add(targetPath)

    fields.push({
      key: targetPath,
      label: item.label,
      value: itemResult.outputValue,
      sources: itemResult.sourcesRead,
      primarySource: itemResult.sourcesRead[0] ?? null,
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

  // Keep the original trace as execution evidence; final validation reflects
  // the source that now supplies each corrected field.
  const isCurrentIssue = (issue: ValidationIssue) =>
    !(
      (issue.code === "invalid-temporal-value" ||
        issue.code === "missing-timezone") &&
      issue.path &&
      issue.path !== issue.fieldKey &&
      overriddenPaths.has(issue.path)
    )
  const result: MappingExecutionResult = {
    profile: {
      clientId: parsedProfile.clientId,
      profileId: parsedProfile.profileId,
      profileVersion: parsedProfile.profileVersion,
      status: parsedProfile.status,
    },
    normalizedDraft,
    normalizedFields: fields.map((field) => ({
      ...field,
      value: valueAtPath(normalizedDraft, field.key),
      validation: field.validation.filter(isCurrentIssue),
      warnings: field.validation
        .filter(isCurrentIssue)
        .filter((issue) => issue.severity === "warning")
        .map((issue) => issue.message),
    })),
    validation: createValidationSummary(issues.filter(isCurrentIssue)),
    executionTrace: trace,
  }
  return {
    ...result,
    validation: collectReviewValidation(result, parsedMessage),
  }
}

function valueAtPath(root: unknown, path: string): unknown {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      root,
    )
}
