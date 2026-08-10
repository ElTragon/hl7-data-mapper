import { describe, expect, it } from "vitest"

import {
  component,
  mapAddressField,
  mapCodedValue,
  mapEntityIdentifier,
  mapIdentifier,
  mapTelecomField,
  parsePositiveInteger,
  stringOrNull,
  subComponent,
} from "./hl7-datatypes.js"

describe("HL7 datatype transforms", () => {
  it("trims strings and treats empty values as missing", () => {
    expect(stringOrNull(" value ")).toBe("value")
    expect(stringOrNull("  ")).toBeNull()
    expect(stringOrNull(42)).toBeNull()
  })

  it("reads components and subcomponents", () => {
    expect(component("one^two", 2)).toBe("two")
    expect(subComponent("one&two", 2)).toBe("two")
    expect(component("one^ ", 2)).toBeNull()
  })

  it("maps identifier and coded datatypes", () => {
    expect(mapIdentifier("MRN-1^^^FACILITY^MR")).toEqual({
      value: "MRN-1",
      assigningAuthority: "FACILITY",
      type: "MR",
    })
    expect(mapEntityIdentifier("ORDER-1^LIS")).toEqual({
      value: "ORDER-1",
      namespaceId: "LIS",
    })
    expect(mapCodedValue("57021-8^CBC panel^LN")).toEqual({
      code: "57021-8",
      display: "CBC panel",
      system: "LN",
    })
  })

  it("maps address and telecom fields", () => {
    expect(mapAddressField("742 Main St^^Los Angeles^CA^90017^USA")).toEqual({
      street: "742 Main St",
      city: "Los Angeles",
      state: "CA",
      postalCode: "90017",
      country: "USA",
    })
    expect(mapTelecomField("^PRN^PH^^1^213^5550142")).toEqual({
      use: "PRN",
      equipmentType: "PH",
      countryCode: "1",
      areaCode: "213",
      localNumber: "5550142",
    })
  })

  it("rejects missing identifiers and invalid positive integers", () => {
    expect(mapIdentifier(null)).toBeNull()
    expect(mapCodedValue("^missing-code")).toBeNull()
    expect(parsePositiveInteger("0")).toBe(0)
    expect(parsePositiveInteger("1.5")).toBeNull()
  })
})
