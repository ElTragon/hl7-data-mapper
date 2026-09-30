import { describe, expect, it } from "vitest"
import {
  assessReviewCompletion,
  isReviewResolved,
  type ReviewSubject,
} from "./review-completion.js"

const field: ReviewSubject = {
  section: "patient",
  value: null,
  reviewStatus: "unreviewed",
  validation: [],
}
describe("review completion", () => {
  it.each([
    ["confirmed", null, null, true],
    ["mapping_changed", null, null, false],
    ["incorrect", null, null, false],
    ["unreviewed", null, null, false],
    ["unavailable", "source_not_populated", null, true],
    ["unavailable", "not_applicable", { name: "" }, true],
    ["unavailable", null, null, false],
    ["unavailable", "wrong_source_mapping", null, false],
    ["unavailable", "not_applicable", false, false],
    ["unavailable", "not_applicable", "value", false],
  ] as const)(
    "resolves %s with reason %s and value %s: %s",
    (reviewStatus, reasonCode, value, expected) => {
      expect(
        isReviewResolved({ ...field, reviewStatus, reasonCode, value }),
      ).toBe(expected)
    },
  )
  it("requires warning acknowledgment, ignores info, and never resolves errors", () => {
    for (const severity of ["warning", "info", "error"] as const) {
      const issueField = {
        ...field,
        section: "exceptions",
        validation: [{ code: "issue", message: "issue", severity }],
      }
      expect(isReviewResolved(issueField)).toBe(severity === "info")
      expect(
        isReviewResolved({ ...issueField, reviewStatus: "confirmed" }),
      ).toBe(severity !== "error")
    }
    expect(assessReviewCompletion([]).status).toBe("completed")
  })
})
