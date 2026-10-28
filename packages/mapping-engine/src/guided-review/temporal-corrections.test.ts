import {
  ClientProfileSchema,
  createSourceReference,
} from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { expect, it } from "vitest"
import { defaultOmlO21ClientProfile } from "../profiles/default-oml-o21-profile.js"
import { executeMapping } from "../execute-mapping.js"
import { buildReviewableFields } from "./build-reviewable-fields.js"
import { selectAlternateSourceForReviewableField } from "./source-selection.js"
import { applyReviewCorrectionAndRerunMapping } from "./correction-workflow.js"

function setup(value: string) {
  const segment = (name: string, fields: Record<number, string>) => {
    const values = Array<string>(
      Math.max(...Object.keys(fields).map(Number)) + 1,
    ).fill("")
    values[0] = name
    for (const [index, value] of Object.entries(fields))
      values[Number(index)] = value
    return values.join("|")
  }
  const parsedMessage = parseHl7Message(
    [
      "MSH|^~\\&|A|B|C|D|20260706101500-0700||OML^O21^OML_O21|1|P|2.5.1",
      "PID|1||MRN^^^LAB^MR||Doe^Jane||19870514|F",
      segment("ORC", { 1: "NW", 2: "ORDER-A", 9: value }),
      "OBR|1|ORDER-A||A^Test A^LN",
      segment("SPM", { 1: "1", 4: "BLD", 17: `${value}^${value}` }),
      segment("SPM", { 1: "2", 4: "SER", 17: value }),
      segment("ORC", { 1: "NW", 2: "ORDER-B", 9: value }),
      "OBR|1|ORDER-B||B^Test B^LN",
    ].join("\r"),
  )
  const profile = ClientProfileSchema.parse({
    ...defaultOmlO21ClientProfile,
    status: "draft",
    publishedAt: null,
  })
  return {
    parsedMessage,
    profile,
    mappingResult: executeMapping({ profile, parsedMessage }),
  }
}

it.each([
  ["20260230100000", "invalid-temporal-value"],
  ["20260706100000", "missing-timezone"],
])("reconciles only the corrected temporal field for %s", (value, code) => {
  const initial = setup(value)
  const paths = [
    "labOrders[0].transactionAt",
    "labOrders[0].specimens[0].collected.startAt",
    "labOrders[0].specimens[0].collected.endAt",
    "labOrders[0].specimens[1].collected.startAt",
    "labOrders[1].transactionAt",
  ]
  let state = initial
  const matchingIssues = (result: typeof initial.mappingResult) =>
    [...result.validation.errors, ...result.validation.warnings].filter(
      (issue) => issue.code === code,
    )
  expect(
    matchingIssues(state.mappingResult)
      .map((issue) => issue.path)
      .sort(),
  ).toEqual([...paths].sort())
  for (const [index, path] of paths.entries()) {
    const field = buildReviewableFields(state).find(
      (field) =>
        field.section !== "exceptions" && field.normalizedPath === path,
    )!
    const corrected = applyReviewCorrectionAndRerunMapping({
      ...state,
      field: selectAlternateSourceForReviewableField({
        field,
        replacementSource: createSourceReference({
          segment: "MSH",
          field: 7,
          component: 1,
        }),
      }),
      updatedAt: "2026-10-28T00:00:00Z",
    })
    state = { ...state, ...corrected }
    expect(
      matchingIssues(state.mappingResult)
        .map((issue) => issue.path)
        .sort(),
    ).toEqual(paths.slice(index + 1).sort())
    expect(
      state.mappingResult.normalizedFields
        .find((field) => field.key === "labOrders")!
        .validation.filter((issue) => issue.code === code),
    ).toHaveLength(paths.length - index - 1)
  }
  expect(state.mappingResult.normalizedDraft).toMatchObject({
    labOrders: [
      { transactionAt: "2026-07-06T10:15:00-07:00" },
      { transactionAt: "2026-07-06T10:15:00-07:00" },
    ],
  })
  expect(
    executeMapping({
      ...state,
      profile: ClientProfileSchema.parse(
        JSON.parse(JSON.stringify(state.profile)),
      ),
    }).validation,
  ).toEqual(state.mappingResult.validation)
})

it("keeps an invalid replacement error instead of silently resolving it", () => {
  const state = setup("20260230100000")
  const path = "labOrders[0].transactionAt"
  const field = buildReviewableFields(state).find(
    (field) => field.normalizedPath === path,
  )!
  const result = applyReviewCorrectionAndRerunMapping({
    ...state,
    field: selectAlternateSourceForReviewableField({
      field,
      replacementSource: createSourceReference({ segment: "PID", field: 8 }),
    }),
    updatedAt: "2026-10-28T00:00:00Z",
  })
  expect(result.mappingResult.validation.errors).toContainEqual(
    expect.objectContaining({
      code: "invalid-temporal-value",
      fieldKey: path,
      source: expect.objectContaining({ path: "PID-8" }),
    }),
  )
})

it("retains specimen validation when an order group cannot be identified", () => {
  const state = setup("20260230100000")
  const parsedMessage = parseHl7Message(
    state.parsedMessage.normalizedText
      .split("\r")
      .filter((line) => !line.startsWith("ORC|"))
      .join("\r"),
  )
  const result = executeMapping({ profile: state.profile, parsedMessage })
  expect(result.validation.errors).toContainEqual(
    expect.objectContaining({
      code: "invalid-temporal-value",
      source: expect.objectContaining({ segment: "SPM" }),
    }),
  )
})
