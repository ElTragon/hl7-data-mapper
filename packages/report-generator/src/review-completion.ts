import {
  assessReviewCompletion,
  normalizedPathKind,
} from "@hl7-data-mapper/contracts"
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
  const recordFields = input.hl7Items.flatMap((item) => {
    const value = valueAt(input.normalizedData, item.targetPath)
    if (!Array.isArray(value)) return []
    const result: typeof fields = []
    function visit(value: unknown, path: string) {
      if (Array.isArray(value))
        value.forEach((entry, index) => visit(entry, `${path}[${index}]`))
      else if (value !== null && typeof value === "object")
        Object.entries(value).forEach(([key, entry]) =>
          visit(entry, `${path}.${key}`),
        )
      else if (
        !input.hl7Items.some((candidate) => candidate.targetPath === path)
      ) {
        const decision = decisions.get(`${item.id}:${path}`)
        const valid =
          decision?.normalizedPath === path &&
          decision.hl7ItemId ===
            (normalizedPathKind(path) === "string" ? item.id : null) &&
          decision.sourcePath == null
        result.push({
          section: item.section,
          value,
          reviewStatus: valid ? decision.reviewStatus : "unreviewed",
          reasonCode: valid ? decision.reasonCode : null,
          validation: issues.filter(
            (issue) =>
              issue.fieldKey === item.targetPath &&
              (!issue.path || issue.path === path),
          ),
        })
      }
    }
    visit(value, item.targetPath)
    return result
  })
  const result = assessReviewCompletion(
    [...fields, ...recordFields, ...warningFields],
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
