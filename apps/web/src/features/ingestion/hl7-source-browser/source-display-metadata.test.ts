import { describe, expect, it } from "vitest"

import {
  getSegmentLabel,
  getSourceDisplayLabel,
} from "./source-display-metadata"

describe("source display metadata", () => {
  it.each([
    ["MSH", "Message header"],
    ["PID", "Patient identification"],
    ["PV1", "Patient visit"],
    ["IN1", "Coverage"],
    ["GT1", "Guarantor"],
    ["ORC", "Common order"],
    ["TQ1", "Timing and quantity"],
    ["OBR", "Observation request"],
    ["SPM", "Specimen"],
    ["NTE", "Notes"],
  ])("labels the %s segment", (segment, expectedLabel) => {
    expect(getSegmentLabel(segment)).toBe(expectedLabel)
  })

  it.each([
    ["MSH-9.1", "Message code"],
    ["PID-5.2", "Given name"],
    ["IN1-36", "Policy number"],
    ["GT1-3", "Guarantor name"],
    ["ORC-12", "Ordering provider"],
    ["TQ1-9", "Order priority"],
    ["OBR-4.1", "Test code"],
    ["SPM-4.2", "Specimen type name"],
  ])("labels the %s source", (path, expectedLabel) => {
    expect(getSourceDisplayLabel(path)).toBe(expectedLabel)
  })

  it("normalizes repetitions before finding the source label", () => {
    expect(getSourceDisplayLabel("PID-3[2].5")).toBe("Identifier type")
  })

  it("falls back safely for client-specific segments and fields", () => {
    expect(getSegmentLabel("ZPI")).toBe("Client or unsupported segment")
    expect(getSourceDisplayLabel("ZPI-4")).toBe("Field 4")
    expect(getSourceDisplayLabel("DIP-7.2")).toBe("Field 7")
    expect(getSourceDisplayLabel("invalid")).toBe("HL7 source")
  })

  it("requires canonical uppercase HL7 segment and source paths", () => {
    expect(getSegmentLabel("pid")).toBe("Client or unsupported segment")
    expect(getSourceDisplayLabel("pid-5.2")).toBe("HL7 source")
  })
})
