import { describe, expect, it } from "vitest"

import {
  mapCoverageArrayFromSourceValues,
  mapGuarantorFromSourceValues,
} from "./coverage.js"

describe("coverage transforms", () => {
  it("returns empty optional values when all inputs are missing", () => {
    expect(mapCoverageArrayFromSourceValues([])).toEqual([])
    expect(mapGuarantorFromSourceValues([])).toBeNull()
  })

  it("maps coverage fields", () => {
    expect(
      mapCoverageArrayFromSourceValues([
        "2",
        "PLAN^Gold^LOCAL",
        "INS-1^AUTH",
        "Acme Health",
        "GROUP-1",
        "Lopez^Elena",
        "SELF^Self^HL70063",
        "POLICY-1",
      ]),
    ).toEqual([
      expect.objectContaining({
        sequence: 2,
        plan: { code: "PLAN", display: "Gold", system: "LOCAL" },
        insurer: { id: "INS-1", name: "Acme Health" },
        groupNumber: "GROUP-1",
        policyNumber: "POLICY-1",
      }),
    ])
  })

  it("maps guarantor composite fields", () => {
    expect(
      mapGuarantorFromSourceValues([
        "GT-1^^^FAC^PI",
        "Lopez^Maria",
        "742 Main St^^Los Angeles^CA^90017^USA",
        "^PRN^PH^^1^213^5550142",
        "19600102",
        "F",
        "P",
        "MTH^Mother^HL70063",
      ]),
    ).toMatchObject({
      identifier: { value: "GT-1", assigningAuthority: "FAC", type: "PI" },
      name: { family: "Lopez", given: "Maria" },
      dateOfBirth: "1960-01-02",
      relationship: { code: "MTH", display: "Mother" },
    })
  })
})
