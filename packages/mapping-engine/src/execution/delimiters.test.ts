import { readFileSync } from "node:fs"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"
import { defaultOmlO21ClientProfile } from "../profiles/default-oml-o21-profile.js"
import { executeMapping } from "./execute-mapping.js"
import { createDatatypeMappers } from "./transforms/hl7-datatypes.js"

const sample = readFileSync(
  new URL("../../../../fixtures/valid/oml-o21-basic.hl7", import.meta.url),
  "utf8",
)
const replacements: Record<string, string> = {
  "|": "*",
  "^": "$",
  "~": "%",
  "\\": "!",
  "&": "@",
}
function custom(value: string) {
  return value.replace(/[|^~\\&]/g, (char) => replacements[char]!)
}

describe("detected mapping delimiters", () => {
  it("maps every default transform equivalently under alternate delimiters", () => {
    const standard = parseHl7Message(sample)
    const alternate = parseHl7Message(custom(sample))
    expect(alternate.errors).toEqual([])
    const run = (parsedMessage: typeof standard) =>
      executeMapping({ parsedMessage, profile: defaultOmlO21ClientProfile })
    expect(run(alternate).normalizedDraft).toEqual(
      run(standard).normalizedDraft,
    )
    expect(
      run(alternate)
        .executionTrace.flatMap((entry) => entry.sourceReads)
        .some((read) => read.rawSegment?.startsWith("PID*")),
    ).toBe(true)
  })
  it("respects custom repetition delimiters during preferred identifier selection", () => {
    const message = sample.replace(
      "MRN-104892^^^NORTHSTAR_LAB^MR",
      "OTHER^^^FAC^PI~MRN-104892^^^NORTHSTAR_LAB^MR",
    )
    const result = executeMapping({
      parsedMessage: parseHl7Message(custom(message)),
      profile: defaultOmlO21ClientProfile,
    })
    expect(result.normalizedDraft).toMatchObject({
      patient: { identifiers: [{ value: "MRN-104892" }] },
    })
  })
  it("keeps standard separator characters and escape tokens as data when custom delimiters are active", () => {
    const maps = createDatatypeMappers({
      field: "*",
      component: "$",
      repetition: "%",
      escape: "!",
      subcomponent: "@",
    })
    expect(maps.mapCodedValue("A^B$literal~text!S!$SYS")).toEqual({
      code: "A^B",
      display: "literal~text!S!",
      system: "SYS",
    })
    expect(maps.mapEntityIdentifierFromComponent("SP@LAB")).toEqual({
      value: "SP",
      namespaceId: "LAB",
    })
  })
})
