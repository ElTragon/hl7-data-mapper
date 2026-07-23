import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"

import {
  buildBuilderPath,
  countHiddenEmptyOptions,
  EMPTY_SOURCE_BUILDER,
  filterOptionsByBuilder,
} from "./source-builder-model"
import { buildSourceOptions } from "./source-search"

const BASE_MSH =
  "MSH|^~\\&|SEND|FAC|RECV|FAC|20260706101500-0700||OML^O21^OML_O21|MSG-1|P|2.5.1"

describe("source builder model", () => {
  it("matches the selected repetition exactly", () => {
    const options = buildSourceOptions(
      parseHl7Message(`${BASE_MSH}\nPID|1||LOCAL^^^CLINIC^PI~MRN-2^^^LAB^MR`),
    )
    const matches = filterOptionsByBuilder(options, {
      ...EMPTY_SOURCE_BUILDER,
      segmentName: "PID",
      field: 3,
      repetition: 1,
    })

    expect(matches.map((option) => option.path)).toContain("PID-3[1]")
    expect(matches.map((option) => option.path)).not.toContain("PID-3")
    expect(matches.every((option) => option.source.repetition === 1)).toBe(true)
  })

  it.each([
    ["contains", "len", ["PID-5", "PID-5.2"]],
    ["equals", "  ELENA  ", ["PID-5.2"]],
    ["starts_with", "LOP", ["PID-5", "PID-5.1"]],
  ] as const)(
    "filters values with %s matching",
    (valueMatchMode, valueQuery, expectedPaths) => {
      const options = buildSourceOptions(
        parseHl7Message(`${BASE_MSH}\nPID|1||MRN-1||Lopez^Elena`),
      )
      const matches = filterOptionsByBuilder(options, {
        ...EMPTY_SOURCE_BUILDER,
        segmentName: "PID",
        field: 5,
        valueQuery,
        valueMatchMode,
      })

      expect(matches.map((option) => option.path)).toEqual(expectedPaths)
    },
  )

  it("counts empty sources after applying both search and builder filters", () => {
    const options = buildSourceOptions(
      parseHl7Message(`${BASE_MSH}\nPID|1||MRN-1||Lopez^`),
    )

    expect(
      countHiddenEmptyOptions({
        options,
        query: "PID-5.2",
        builder: EMPTY_SOURCE_BUILDER,
      }),
    ).toBe(1)
  })

  it("builds a fully qualified path for repeated segments and fields", () => {
    const parsedMessage = parseHl7Message(
      [
        BASE_MSH,
        "PID|1||LOCAL^^^CLINIC&ONE^PI~MRN-1^^^LAB^MR",
        "PID|2||SECOND^^^CLINIC&TWO^PI~MRN-2^^^LAB^MR",
      ].join("\n"),
    )
    const selectedSegment = parsedMessage.segments[2] ?? null
    const selectedField =
      selectedSegment?.fields.find((field) => field.index === 3) ?? null
    const selectedRepetition = selectedField?.repetitions[0] ?? null
    const selectedComponent = selectedRepetition?.components[3] ?? null

    expect(
      buildBuilderPath(
        {
          ...EMPTY_SOURCE_BUILDER,
          segmentName: "PID",
          segmentIndex: selectedSegment?.index ?? null,
          field: 3,
          repetition: 1,
          component: 4,
          subComponent: 2,
        },
        {
          selectedSegment,
          selectedSegmentOccurrence: 2,
          segmentCount: 2,
          selectedField,
          selectedRepetition,
          selectedComponent,
        },
      ),
    ).toBe("PID[2]-3[1].4.2")
  })
})
