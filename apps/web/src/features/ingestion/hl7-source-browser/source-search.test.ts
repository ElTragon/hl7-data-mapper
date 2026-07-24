import { createSourceReference } from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"

import { buildSourceOptions } from "./source-options"
import {
  findSourceOption,
  groupSourceOptions,
  searchSourceOptions,
} from "./source-search"

const BASE_MSH =
  "MSH|^~\\&|SEND|FAC|RECV|FAC|20260706101500-0700||OML^O21^OML_O21|MSG-1|P|2.5.1"

describe("source search", () => {
  it("separates segment occurrences, message rows, and order groups", () => {
    const parsedMessage = parseHl7Message(
      [
        BASE_MSH,
        "PID|1||MRN-1||Lopez^Elena",
        "ORC|NW|ORDER-1",
        "OBR|1|ORDER-1||TEST-1^First test",
        "SPM|1|||BLD^Blood",
        "ORC|NW|ORDER-2",
        "OBR|1|ORDER-2||TEST-2^Second test",
      ].join("\n"),
    )
    const options = buildSourceOptions(parsedMessage)
    const obrGroups = groupSourceOptions(
      options.filter((option) => option.segment.name === "OBR"),
    )

    expect(obrGroups).toHaveLength(2)
    expect(obrGroups[0]).toMatchObject({
      occurrence: 1,
      orderGroup: 1,
      segment: { index: 3 },
    })
    expect(obrGroups[1]).toMatchObject({
      occurrence: 2,
      orderGroup: 2,
      segment: { index: 6 },
    })
  })

  it("targets an exact segment occurrence without changing the stored path", () => {
    const parsedMessage = parseHl7Message(
      [
        BASE_MSH,
        "PID|1||MRN-1||Lopez^Elena",
        "PID|2||MRN-2||Rivera^Sofia",
      ].join("\n"),
    )
    const result = searchSourceOptions(
      buildSourceOptions(parsedMessage),
      "PID[2]-5.1",
      false,
    )

    expect(result.error).toBeNull()
    expect(result.options).toHaveLength(1)
    expect(result.options[0]).toMatchObject({
      path: "PID-5.1",
      previewValue: "Rivera",
      segmentOccurrence: 2,
      segment: { index: 2 },
    })
  })

  it("distinguishes a missing saved source from an empty source", () => {
    const options = buildSourceOptions(
      parseHl7Message(`${BASE_MSH}\nPID|1||MRN-1||Lopez^`),
    )
    const emptySource = createSourceReference({
      segment: "PID",
      field: 5,
      component: 2,
      segmentIndex: 1,
    })
    const absentSource = createSourceReference({
      segment: "PID",
      field: 6,
      component: 1,
      segmentIndex: 1,
    })

    expect(findSourceOption(options, emptySource)?.previewValue).toBe("")
    expect(findSourceOption(options, absentSource)).toBeNull()
  })

  it("reports malformed paths and returns no result for an absent occurrence", () => {
    const options = buildSourceOptions(
      parseHl7Message(`${BASE_MSH}\nPID|1||MRN-1||Lopez^Elena`),
    )

    expect(searchSourceOptions(options, "PID-5.x", false)).toEqual({
      options: [],
      error: "That HL7 path is not valid. Try PID, PID-5.1, or PID[2]-5.1.",
    })
    expect(searchSourceOptions(options, "PID[2]-5.1", false)).toEqual({
      options: [],
      error: null,
    })
  })

  it("keeps unknown and client-specific segments available for mapping", () => {
    const options = buildSourceOptions(
      parseHl7Message(
        `${BASE_MSH}\nPID|1||MRN-1||Lopez^Elena\nZPI|CLIENT-ID|Custom value`,
      ),
    )

    expect(sourceValue(options, "ZPI-1")).toBe("CLIENT-ID")
    expect(sourceValue(options, "ZPI-2")).toBe("Custom value")
    expect(searchSourceOptions(options, "ZPI-2", false).options).toHaveLength(1)
  })
})

function sourceValue(
  options: ReturnType<typeof buildSourceOptions>,
  path: string,
): string | undefined {
  return options.find((option) => option.path === path)?.previewValue
}
