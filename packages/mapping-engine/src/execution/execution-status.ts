import type { ValidationIssue } from "@hl7-data-mapper/contracts"

import type { MappingExecutionStatus } from "./types.js"

export function getTraceStatus(
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
