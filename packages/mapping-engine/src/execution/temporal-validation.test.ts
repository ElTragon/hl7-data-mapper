import { readFileSync } from "node:fs"
import { createSourceReference } from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { expect, it } from "vitest"
import { defaultOmlO21ClientProfile } from "../profiles/default-oml-o21-profile.js"
import { executeMapping } from "./execute-mapping.js"

function run(raw: string, required = false) {
  const parsedMessage = parseHl7Message(
    `MSH|^~\\&|A|B|C|D|${raw}||OML^O21^OML_O21|1|P|2.5.1\rPID|1||MRN\rORC|NW|ORDER\rOBR|1|ORDER||CBC^CBC^LN\rSPM|1||S|BLD`,
  )
  const item = defaultOmlO21ClientProfile.itemSet.items[0]!
  return executeMapping({
    parsedMessage,
    profile: {
      ...defaultOmlO21ClientProfile,
      itemSet: {
        ...defaultOmlO21ClientProfile.itemSet,
        items: [
          {
            ...item,
            required,
            sources: [
              createSourceReference({ segment: "MSH", field: 7, component: 1 }),
            ],
          },
        ],
      },
    },
  })
}
it.each([true, false])(
  "rejects invalid timestamps even when required=%s",
  (required) => {
    const result = run("20260230101500", required)
    expect(result.executionTrace[0]?.outputValue).toBeNull()
    expect(result.validation.errors).toEqual([
      expect.objectContaining({
        code: "invalid-temporal-value",
        source: expect.objectContaining({ path: "MSH-7.1" }),
      }),
    ])
  },
)
it("preserves local precision and exposes missing timezone in review validation", () => {
  const result = run("202607061015")
  expect(result.executionTrace[0]?.outputValue).toBe("2026-07-06T10:15")
  expect(result.validation.warnings).toContainEqual(
    expect.objectContaining({ code: "missing-timezone" }),
  )
})
it("does not invent time or timezone for a partial date", () => {
  const result = run("202607")
  expect(result.executionTrace[0]?.outputValue).toBe("2026-07")
  expect(result.validation.warnings).toEqual([])
})

it("reports invalid dates inside order and guarantor transforms with source evidence", () => {
  const sample = readFileSync(
    new URL("../../../../fixtures/valid/oml-o21-basic.hl7", import.meta.url),
    "utf8",
  )
  const raw = sample
    .split(/\r?\n/)
    .map((line) => {
      const fields = line.split("|")
      if (fields[0] === "GT1") fields[8] = "20260230"
      if (fields[0] === "ORC") fields[9] = "20260706250000"
      if (fields[0] === "SPM") fields[17] = "20260230010000^20260706100000-0700"
      return fields.join("|")
    })
    .join("\r")
  const result = executeMapping({
    parsedMessage: parseHl7Message(raw),
    profile: defaultOmlO21ClientProfile,
  })
  const errors = result.validation.errors.filter(
    (issue) => issue.code === "invalid-temporal-value",
  )
  expect(errors.map((issue) => issue.source?.segment)).toEqual(
    expect.arrayContaining(["GT1", "ORC", "SPM"]),
  )
})
