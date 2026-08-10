import { describe, expect, it } from "vitest"

import { normalizeDate, normalizeTimestamp } from "./temporal.js"

describe("temporal transforms", () => {
  it("normalizes HL7 dates", () => {
    expect(normalizeDate("19870514")).toBe("1987-05-14")
    expect(normalizeDate("198705141200")).toBe("1987-05-14")
  })

  it("normalizes timestamps with and without timezone offsets", () => {
    expect(normalizeTimestamp("20260706101500-0700")).toBe(
      "2026-07-06T10:15:00-07:00",
    )
    expect(normalizeTimestamp("20260706")).toBe("2026-07-06T00:00:00Z")
  })

  it("rejects malformed temporal values", () => {
    expect(normalizeDate("2026-07-06")).toBeNull()
    expect(normalizeTimestamp("2026070610-0700")).toBeNull()
    expect(normalizeTimestamp(null)).toBeNull()
  })
})
