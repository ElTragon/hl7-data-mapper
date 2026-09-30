import { describe, expect, it } from "vitest"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { createSourceReference } from "@hl7-data-mapper/contracts"
import { executeMapping } from "../execute-mapping.js"
import { defaultOmlO21ClientProfile } from "../profiles/default-oml-o21-profile.js"
import {
  collectReviewValidation,
  buildWarningReviewFields,
} from "./warning-review-fields.js"

it("keeps occurrence identities stable when issue order changes", () => {
  const parsed = parseHl7Message(
    "MSH|^~\\&|A|B|C|D|20260101||OML^O21^OML_O21|1|P|2.5.1",
  )
  const result = executeMapping({
    parsedMessage: parsed,
    profile: defaultOmlO21ClientProfile,
  })
  const source = createSourceReference({ segment: "OBR", field: 4 })
  const issues = [1, 2].map((segmentIndex) => ({
    origin: "mapping" as const,
    severity: "warning" as const,
    code: "same-code",
    message: "Missing test",
    source,
    segmentIndex,
  }))
  const collect = (warnings: typeof issues) =>
    collectReviewValidation(
      {
        ...result,
        executionTrace: [],
        validation: { errors: [], warnings, info: [] },
      },
      { ...parsed, errors: [], warnings: [] },
    )
  const first = collect(issues),
    second = collect([...issues].reverse())
  expect(new Set(first.warnings.map((issue) => issue.id)).size).toBe(2)
  expect(first.warnings.map((issue) => issue.id)).toEqual(
    second.warnings.map((issue) => issue.id).reverse(),
  )
  expect(
    buildWarningReviewFields({ ...result, validation: first }).map(
      (field) => field.id,
    ),
  ).toEqual(first.warnings.map((issue) => `issue:${issue.id}`))
})

describe("parser validation propagation", () => {
  it("includes parser warnings in mapping validation and review fields", () => {
    const parsed = parseHl7Message(
      "MSH|^~\\&|A|B|C|D|20260101||OML^O21^OML_O21|1|P|2.5.1",
    )
    const result = executeMapping({
      parsedMessage: {
        ...parsed,
        errors: [],
        warnings: [
          {
            code: "parser-warning",
            severity: "warning",
            message: "Check header",
            segmentName: "MSH",
            segmentIndex: 0,
          },
        ],
      },
      profile: defaultOmlO21ClientProfile,
    })
    expect(result.validation.warnings).toContainEqual(
      expect.objectContaining({
        origin: "parser",
        code: "parser-warning",
        id: expect.any(String),
      }),
    )
    expect(buildWarningReviewFields(result)).toContainEqual(
      expect.objectContaining({
        validation: [expect.objectContaining({ code: "parser-warning" })],
      }),
    )
  })
})
