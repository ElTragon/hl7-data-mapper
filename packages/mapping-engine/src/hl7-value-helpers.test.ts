import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"

import {
  chooseIdentifier,
  mapAddress,
  mapCodedValue,
  mapEntityIdentifier,
  mapEntityIdentifierFromComponent,
  mapPersonName,
  mapProvider,
  mapTelecom,
  normalizeHl7Date,
  normalizeHl7Timestamp,
  parseInteger,
} from "./hl7-value-helpers.js"

const message =
  parseHl7Message(`MSH|^~\\&|APP|FAC|RECAPP|RECFAC|20260706101500-0700||OML^O21^OML_O21|MSG-1|P|2.5.1
PID|1||ALT-1^^^ALT_AUTH^PI~MRN-104892^^^NORTHSTAR_LAB^MR||Lopez^Elena^M^Jr^Dr||19870514|F|||742 Evergreen Ave^^Los Angeles^CA^90017^USA||^PRN^PH^^^213^5550142
IN1|1|PPO-42^Preferred Provider Plan^99DEMO|ACME-001^^^ACME^NI|Acme Health Plan||||GRP-7781||||||||Lopez^Elena^M|SEL^Self^HL70063|||||||||||||||||||POL-558903
ORC|NW|ORD-90017^NORTHSTAR_LIS|FILL-41220^NORTHSTAR_LAB||SC||||20260706101000-0700|||12345^Patel^Anika^^^^MD
OBR|1|ORD-90017^NORTHSTAR_LIS|FILL-41220^NORTHSTAR_LAB|57021-8^CBC W Auto Differential panel^LN||||||||||||12345^Patel^Anika^^^^MD
SPM|1|SPM-90017&NORTHSTAR_LIS^SPM-41220&NORTHSTAR_LAB||BLD^Whole blood^HL70487`)

function field(segmentName: string, fieldIndex: number) {
  return message.segments
    .find((segment) => segment.name === segmentName)
    ?.fields.find((candidate) => candidate.index === fieldIndex)
}

describe("HL7 value helpers", () => {
  it("chooses the preferred CX identifier type", () => {
    expect(chooseIdentifier(field("PID", 3), "MR")).toEqual({
      value: "MRN-104892",
      assigningAuthority: "NORTHSTAR_LAB",
      type: "MR",
    })
  })

  it("maps XPN person names", () => {
    expect(mapPersonName(field("PID", 5)?.repetitions[0])).toEqual({
      family: "Lopez",
      given: "Elena",
      middle: "M",
      suffix: "Jr",
      prefix: "Dr",
    })
  })

  it("maps XAD addresses", () => {
    expect(mapAddress(field("PID", 11)?.repetitions[0])).toEqual({
      street: "742 Evergreen Ave",
      city: "Los Angeles",
      state: "CA",
      postalCode: "90017",
      country: "USA",
    })
  })

  it("maps XTN telecom values", () => {
    expect(mapTelecom(field("PID", 13)?.repetitions[0])).toEqual({
      use: "PRN",
      equipmentType: "PH",
      countryCode: null,
      areaCode: "213",
      localNumber: "5550142",
    })
  })

  it("maps CE and CWE coded values", () => {
    expect(mapCodedValue(field("OBR", 4)?.repetitions[0])).toEqual({
      code: "57021-8",
      display: "CBC W Auto Differential panel",
      system: "LN",
    })
  })

  it("maps EI entity identifiers", () => {
    expect(mapEntityIdentifier(field("OBR", 2)?.repetitions[0])).toEqual({
      value: "ORD-90017",
      namespaceId: "NORTHSTAR_LIS",
    })
  })

  it("maps EIP component entity identifiers", () => {
    const specimenPair = field("SPM", 2)?.repetitions[0]

    expect(
      mapEntityIdentifierFromComponent(specimenPair?.components[0]),
    ).toEqual({
      value: "SPM-90017",
      namespaceId: "NORTHSTAR_LIS",
    })
  })

  it("maps XCN providers", () => {
    expect(mapProvider(field("ORC", 12)?.repetitions[0])).toEqual({
      id: "12345",
      family: "Patel",
      given: "Anika",
    })
  })

  it("normalizes dates and timestamps", () => {
    expect(normalizeHl7Date("19870514")).toBe("1987-05-14")
    expect(normalizeHl7Timestamp("20260706101500-0700")).toBe(
      "2026-07-06T10:15:00-07:00",
    )
  })

  it("parses integers safely", () => {
    expect(parseInteger("42")).toBe(42)
    expect(parseInteger("not-a-number")).toBeNull()
  })
})
