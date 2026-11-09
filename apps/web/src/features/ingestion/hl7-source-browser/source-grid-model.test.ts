import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"

import { buildSourceOptions } from "./source-options"
import {
  buildSourceGridRows,
  filterSourceGridRows,
  formatGridCoordinate,
  parseSourceGridCoordinate,
} from "./source-grid-model"

describe("HL7 source grid model", () => {
  it("keeps original message rows when filtering repeated segments", () => {
    const parsedMessage = parseHl7Message(
      [
        "MSH|^~\\&|SEND|FAC|RECV|FAC|20260706101500||OML^O21^OML_O21|MSG-1|P|2.5.1",
        "PID|1||MRN-1||Lopez^Mario",
        "ORC|NW|ORDER-1",
        "PID|2||MRN-2||Smith^Alex",
      ].join("\r"),
    )
    const sourceOptions = buildSourceOptions(parsedMessage)
    const sourceGridRows = buildSourceGridRows(parsedMessage, sourceOptions)
    const patientRows = filterSourceGridRows(sourceGridRows, {
      segmentName: "PID",
      messageRowNumber: "",
      searchText: "",
    })

    expect(
      patientRows.map((sourceGridRow) => ({
        messageRowNumber: sourceGridRow.messageRowNumber,
        segmentOccurrenceNumber: sourceGridRow.segmentOccurrenceNumber,
      })),
    ).toEqual([
      { messageRowNumber: 2, segmentOccurrenceNumber: 1 },
      { messageRowNumber: 4, segmentOccurrenceNumber: 2 },
    ])

    const secondPatientRow = filterSourceGridRows(sourceGridRows, {
      segmentName: "PID",
      messageRowNumber: "4",
      searchText: "Smith",
    })[0]
    const givenName = secondPatientRow?.sourceOptionsByFieldNumber
      .get(5)
      ?.find((sourceOption) => sourceOption.path === "PID-5.2")

    expect(givenName && formatGridCoordinate(givenName)).toBe(
      "PID(row 4) × 5.2",
    )
    expect(givenName?.previewValue).toBe("Alex")
    expect(
      filterSourceGridRows(sourceGridRows, {
        segmentName: "ORC",
        messageRowNumber: "3",
        searchText: "PID(row 4) × 5.2",
      }).map((sourceGridRow) => sourceGridRow.messageRowNumber),
    ).toEqual([])
  })

  it("accepts the grid's displayed coordinate and its compact shorthand", () => {
    expect(parseSourceGridCoordinate("PID(row 2) × 5.1")).toMatchObject({
      segmentName: "PID",
      messageRowNumber: 2,
      fieldNumber: 5,
      componentNumber: 1,
    })
    expect(parseSourceGridCoordinate("PID(2)x5.1")).toEqual(
      parseSourceGridCoordinate("PID(row 2) × 5.1"),
    )
    expect(parseSourceGridCoordinate("PIDx5.1")).toMatchObject({
      segmentName: "PID",
      messageRowNumber: null,
      fieldNumber: 5,
      componentNumber: 1,
    })
  })
})
