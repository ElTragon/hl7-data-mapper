import { createSourceReference } from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"
import { defaultOmlO21ClientProfile } from "../profiles/default-oml-o21-profile.js"
import { executeMapping } from "./execute-mapping.js"

const parsedMessage = parseHl7Message(
  [
    "MSH|^~\\&|A|B|C|D|20260706101500-0700||OML^O21^OML_O21|1|P|2.5.1",
    "PID|1||OTHER^^^LAB^PI~MRN^^^LAB^MR",
    "ORC|NW|ORDER",
    "OBR|1|ORDER||CBC^CBC^LN",
    "SPM|1||SPECIMEN|BLD",
  ].join("\r"),
)
const identifier = defaultOmlO21ClientProfile.itemSet.items.find(
  (item) => item.id === "patient-identifier-mrn",
)!
function run(selection: Parameters<typeof createSourceReference>[0]) {
  return executeMapping({
    parsedMessage,
    profile: {
      ...defaultOmlO21ClientProfile,
      itemSet: {
        ...defaultOmlO21ClientProfile.itemSet,
        items: [
          {
            ...identifier,
            sourceExpectations: [],
            sources: [createSourceReference(selection)],
          },
        ],
      },
    },
  })
}
describe("explicit identifier selection", () => {
  it("prefers MR only for an unqualified field", () => {
    expect(
      run({ segment: "PID", field: 3 }).executionTrace[0]?.outputValue,
    ).toMatchObject({ value: "MRN" })
  })
  it("honors an explicit repetition even when it is not MR", () => {
    expect(
      run({ segment: "PID", field: 3, repetition: 1 }).executionTrace[0]
        ?.outputValue,
    ).toMatchObject({ value: "OTHER", type: "PI" })
  })
  it("does not reinterpret a selected scalar as the complete field", () => {
    expect(
      run({ segment: "PID", field: 3, repetition: 2, component: 1 })
        .executionTrace[0]?.outputValue,
    ).toEqual({ value: "MRN", type: null, assigningAuthority: null })
  })
  it("does not fall back when the selected repetition is missing", () => {
    const result = run({ segment: "PID", field: 3, repetition: 3 })
    expect(result.executionTrace[0]?.outputValue).toBeNull()
    expect(result.validation.errors).toEqual([
      expect.objectContaining({ code: "missing-required-value" }),
    ])
  })
})
