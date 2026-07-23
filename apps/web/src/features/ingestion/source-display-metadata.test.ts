import { describe, expect, it } from "vitest"

import {
  getSegmentLabel,
  getSourceDisplayLabel,
} from "./source-display-metadata"

describe("source display metadata", () => {
  it("adds human labels without changing technical source paths", () => {
    expect(getSegmentLabel("PID")).toBe("Patient identification")
    expect(getSourceDisplayLabel("PID-5.2")).toBe("Given name")
    expect(getSourceDisplayLabel("PID-3[2].5")).toBe("Identifier type")
  })

  it("falls back safely for client-specific segments and fields", () => {
    expect(getSegmentLabel("ZPI")).toBe("Client or unsupported segment")
    expect(getSourceDisplayLabel("ZPI-4")).toBe("Field 4")
    expect(getSourceDisplayLabel("DIP-7.2")).toBe("Field 7")
  })
})
