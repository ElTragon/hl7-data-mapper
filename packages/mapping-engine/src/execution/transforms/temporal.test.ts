import { describe, expect, it } from "vitest"
import { normalizeDate, normalizeTimestamp, parseTemporal } from "./temporal.js"
import {
  normalizeHl7Date,
  normalizeHl7Timestamp,
} from "../../hl7-value-helpers.js"

describe("temporal normalization", () => {
  it.each([
    ["2026", "2026"],
    ["202607", "2026-07"],
    ["20260706", "2026-07-06"],
    ["2026070610", "2026-07-06T10"],
    ["202607061015", "2026-07-06T10:15"],
    ["20260706101500", "2026-07-06T10:15:00"],
    ["20260706101500.1234-0700", "2026-07-06T10:15:00.1234-07:00"],
    ["2026070610+0530", "2026-07-06T10+05:30"],
    ["20000229000000+0000", "2000-02-29T00:00:00+00:00"],
  ])("preserves precision and offset for %s", (raw, expected) => {
    expect(normalizeTimestamp(raw)).toBe(expected)
    expect(normalizeHl7Timestamp(raw)).toBe(expected)
  })
  it.each([
    "00000101",
    "19000229",
    "20260229",
    "20260431",
    "20260001",
    "20261301",
    "20260100",
    "20260101240000",
    "20260101236000",
    "20260101235960",
    "20260101235959+1460",
    "20260101235959-1401",
    "20260101235959+1500",
    "20260706junk",
    "20260706\n",
    " 20260706",
    "2026-07-06",
    "202607061",
    "20260706101500.12345",
    "202607.1",
    "20260706+0000",
    "",
    null,
    20260706,
  ])("rejects invalid value %s consistently", (raw) => {
    expect(normalizeTimestamp(raw)).toBeNull()
    expect(normalizeDate(raw)).toBeNull()
  })
  it("preserves valid partial dates and validates complete input before taking the date", () => {
    expect(normalizeDate("198705141200")).toBe("1987-05-14")
    expect(normalizeHl7Date("198705")).toBe("1987-05")
    expect(normalizeDate("198705142500")).toBeNull()
    expect(normalizeDate("20240229")).toBe("2024-02-29")
  })
  it("describes precision and an unknown timezone without consulting the machine timezone", () => {
    expect(parseTemporal("202607061015")).toEqual({
      value: "2026-07-06T10:15",
      precision: "minute",
      offset: null,
    })
  })
})
