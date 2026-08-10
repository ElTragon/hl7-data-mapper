import { describe, expect, it } from "vitest"

import { mapLabOrderArrayFromSourceValues } from "./order.js"

describe("order transforms", () => {
  it("returns no orders when all inputs are missing", () => {
    expect(mapLabOrderArrayFromSourceValues([])).toEqual([])
  })

  it("maps order and specimen fields with preferred OBR identifiers", () => {
    const inputs = Array<unknown>(20).fill(null)
    inputs[0] = "NW"
    inputs[1] = "ORC-PLACER^ORC-LIS"
    inputs[2] = "ORC-FILLER^ORC-LAB"
    inputs[4] = "20260706101000-0700"
    inputs[9] = "OBR-PLACER^OBR-LIS"
    inputs[10] = "OBR-FILLER^OBR-LAB"
    inputs[11] = "57021-8^CBC panel^LN"
    inputs[13] = "1"
    inputs[14] = "PLACER&LIS^FILLER&LAB"
    inputs[15] = "BLD^Whole blood^HL70487"
    inputs[17] = "20260706100000-0700^20260706100500-0700"

    expect(mapLabOrderArrayFromSourceValues(inputs)).toEqual([
      expect.objectContaining({
        controlCode: "NW",
        placerOrderNumber: { value: "OBR-PLACER", namespaceId: "OBR-LIS" },
        fillerOrderNumber: { value: "OBR-FILLER", namespaceId: "OBR-LAB" },
        service: { code: "57021-8", display: "CBC panel", system: "LN" },
        specimens: [
          expect.objectContaining({
            sequence: 1,
            placerId: { value: "PLACER", namespaceId: "LIS" },
            fillerId: { value: "FILLER", namespaceId: "LAB" },
          }),
        ],
      }),
    ])
  })
})
