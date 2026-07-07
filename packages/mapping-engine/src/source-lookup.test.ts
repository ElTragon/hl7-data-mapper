import { createSourceReference } from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"

import {
  getOrderGroups,
  getSegmentsByName,
  readSource,
} from "./source-lookup.js"

const messageWithTwoOrders = `MSH|^~\\&|NORTHSTAR_LIS|NORTHSTAR_LAB|HL7_MAPPER|DEMO_FACILITY|20260706101500-0700||OML^O21^OML_O21|MSG-20260706-0001|P|2.5.1
PID|1||MRN-104892^^^NORTHSTAR_LAB^MR||Lopez^Elena^M
ORC|NW|ORD-90017^NORTHSTAR_LIS
TQ1|1||||||20260706103000-0700
OBR|1|ORD-90017^NORTHSTAR_LIS|FILL-41220^NORTHSTAR_LAB|57021-8^CBC W Auto Differential panel^LN
SPM|1|SPM-90017&NORTHSTAR_LIS^SPM-41220&NORTHSTAR_LAB||BLD^Whole blood^HL70487
ORC|NW|ORD-90018^NORTHSTAR_LIS
OBR|1|ORD-90018^NORTHSTAR_LIS|FILL-41221^NORTHSTAR_LAB|24323-8^Comprehensive metabolic 2000 panel - Serum or Plasma^LN
SPM|1|SPM-90018&NORTHSTAR_LIS^SPM-41221&NORTHSTAR_LAB||SER^Serum^HL70487`

describe("source lookup", () => {
  it("reads component values with raw evidence", () => {
    const parsedMessage = parseHl7Message(messageWithTwoOrders)
    const read = readSource(
      parsedMessage,
      createSourceReference({
        segment: "PID",
        field: 5,
        component: 1,
      }),
    )

    expect(read).toMatchObject({
      value: "Lopez",
      status: "found",
      segmentIndex: 1,
      rawField: "Lopez^Elena^M",
    })
    expect(read.rawSegment).toContain("PID|")
  })

  it("reads subcomponent values", () => {
    const parsedMessage = parseHl7Message(messageWithTwoOrders)
    const read = readSource(
      parsedMessage,
      createSourceReference({
        segment: "SPM",
        field: 2,
        component: 1,
        subComponent: 2,
      }),
    )

    expect(read.value).toBe("NORTHSTAR_LIS")
    expect(read.status).toBe("found")
  })

  it("reports missing source parts without throwing", () => {
    const parsedMessage = parseHl7Message(messageWithTwoOrders)
    const read = readSource(
      parsedMessage,
      createSourceReference({
        segment: "PID",
        field: 99,
      }),
    )

    expect(read).toMatchObject({
      value: null,
      status: "missing_field",
      segmentIndex: 1,
    })
  })

  it("groups ORC order segments deterministically", () => {
    const parsedMessage = parseHl7Message(messageWithTwoOrders)
    const groups = getOrderGroups(parsedMessage)

    expect(groups).toHaveLength(2)
    expect(groups[0]?.orderIndex).toBe(0)
    expect(groups[0]?.orc.raw).toContain("ORD-90017")
    expect(groups[0]?.spm).toHaveLength(1)
    expect(groups[1]?.orderIndex).toBe(1)
    expect(groups[1]?.orc.raw).toContain("ORD-90018")
    expect(groups[1]?.spm).toHaveLength(1)
  })

  it("returns segments by name in message order", () => {
    const parsedMessage = parseHl7Message(messageWithTwoOrders)
    const spmSegments = getSegmentsByName(parsedMessage, "SPM")

    expect(spmSegments.map((segment) => segment.index)).toEqual([5, 8])
  })
})
