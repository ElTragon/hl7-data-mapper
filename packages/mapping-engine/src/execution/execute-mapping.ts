import {
  canExecuteClientProfile,
  ClientProfileSchema,
  createValidationSummary,
  sortHl7ItemsForExecution,
  type NormalizedField,
  type ValidationIssue,
} from "@hl7-data-mapper/contracts"

import { executeItem } from "./execute-item.js"
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

  for (const item of sortHl7ItemsForExecution(parsedProfile.itemSet.items)) {
    const itemResult = executeItem({ item, parsedMessage, itemOutputs })

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
