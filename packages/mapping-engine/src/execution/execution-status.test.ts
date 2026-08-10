import type { ValidationIssue } from "@hl7-data-mapper/contracts"
import { describe, expect, it } from "vitest"

import { getTraceStatus } from "./execution-status.js"

const issue = (severity: ValidationIssue["severity"]): ValidationIssue => ({
  code: "test-issue",
  severity,
  message: "Test issue",
  fieldKey: "patient.test",
  section: "patient",
  source: null,
})

describe("getTraceStatus", () => {
  it("prioritizes errors over all other statuses", () => {
    expect(getTraceStatus([issue("error")], true)).toBe("error")
  })

  it("marks pending transforms and warnings", () => {
    expect(getTraceStatus([], true)).toBe("pending_transform")
    expect(getTraceStatus([issue("warning")], false)).toBe(
      "completed_with_warnings",
    )
  })

  it("marks issue-free execution as completed", () => {
    expect(getTraceStatus([], false)).toBe("completed")
  })
})
