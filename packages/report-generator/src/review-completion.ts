import { assessReviewCompletion } from "@hl7-data-mapper/contracts"
import type { BuildReportPackageInput } from "./types.js"

export function assessReportReview(input: BuildReportPackageInput) {
  const decisions = new Map(
    input.reviewDecisions.map((decision) => [decision.fieldId, decision]),
  )
  const issues = [
    ...input.validationResults.errors,
    ...input.validationResults.warnings,
    ...input.validationResults.info,
  ]
  const fields = input.hl7Items.map((item) => {
    const decision = decisions.get(item.id)
    const valid =
      decision?.normalizedPath === item.targetPath &&
      decision.hl7ItemId === item.id &&
      (decision.sourcePath ?? null) === (item.sources[0]?.path ?? null)
    return {
      section: item.section,
      value: valueAt(input.normalizedData, item.targetPath),
      reviewStatus: valid ? decision.reviewStatus : ("unreviewed" as const),
      reasonCode: valid ? decision.reasonCode : null,
      validation: issues.filter((issue) => issue.fieldKey === item.targetPath),
    }
  })
  const warningFields = issues.map((issue) => {
    const decision = issue.id ? decisions.get(`issue:${issue.id}`) : undefined
    const path = issue.fieldKey ?? issue.path ?? `validation.${issue.id}`
    return {
      section: "exceptions",
      value: null,
      reviewStatus:
        decision?.normalizedPath === path &&
        (decision.sourcePath ?? null) === (issue.source?.path ?? null)
          ? decision.reviewStatus
          : ("unreviewed" as const),
      validation: [issue],
    }
  })
  const result = assessReviewCompletion(
    [...fields, ...warningFields],
    input.validationResults,
  )
  return {
    ...result,
    status: fields.length === 0 ? ("interim" as const) : result.status,
  }
}

function valueAt(root: unknown, path: string): unknown {
  let value = root
  for (const key of path.replace(/\[(\d+)\]/g, ".$1").split(".")) {
    if (!value || typeof value !== "object") return undefined
    value = Object.getOwnPropertyDescriptor(value, key)?.value
  }
  return value
}
