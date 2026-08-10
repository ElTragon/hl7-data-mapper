import { createSourceReference } from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"

import { buildSourceOptions } from "./source-options"
import { getCandidateBlockReason } from "./source-selection-rules"

const MESSAGE = [
  "MSH|^~\\&|SEND|FAC|RECV|FAC|20260706101500-0700||OML^O21^OML_O21|MSG-1|P|2.5.1",
  "PID|1||MRN-1||Lopez^",
  "ORC|NW|ORDER-1",
  "OBR|1|ORDER-1||TEST^Panel^L",
  "SPM|1|SPEC-1||BLD^Blood^HL70487",
].join("\r")

describe("source selection rules", () => {
  const options = buildSourceOptions(parseHl7Message(MESSAGE))

  it("allows a populated scalar source", () => {
    expect(getCandidateBlockReason(findOption("PID-5.1"), true)).toBeNull()
  })

  it("blocks an empty source", () => {
    expect(getCandidateBlockReason(findOption("PID-5.2"), false)).toBe(
      "This source exists but is empty in the current message.",
    )
  })

  it("blocks a composite source for a person-name part", () => {
    expect(getCandidateBlockReason(findOption("PID-5"), true)).toMatch(
      /choose a scalar component/i,
    )
  })

  it("allows composite sources for non-name fields and handles no selection", () => {
    expect(getCandidateBlockReason(findOption("PID-5"), false)).toBeNull()
    expect(getCandidateBlockReason(null, true)).toBeNull()
  })

  function findOption(path: string) {
    const source = createSourceReference({
      segment: path.slice(0, 3),
      field: Number(/-(\d+)/.exec(path)?.[1]),
      component: Number(/\.(\d+)/.exec(path)?.[1]) || undefined,
    })
    const option = options.find((candidate) => candidate.path === source.path)

    if (!option) {
      throw new Error(`Expected source option ${path}.`)
    }

    return option
  }
})
