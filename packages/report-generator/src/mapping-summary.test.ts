import { describe, expect, it } from "vitest"

import { escapeCsvCell } from "./mapping-summary.js"

describe("mapping summary CSV formatting", () => {
  it.each(["=SUM(A1:A2)", "+1", "-1", "@command", "\tvalue"])(
    "neutralizes spreadsheet formula input %s",
    (value) => {
      expect(escapeCsvCell(value)).toBe(`'${value}`)
    },
  )

  it("neutralizes and quotes carriage-return input", () => {
    expect(escapeCsvCell("\rvalue")).toBe('"\'\rvalue"')
  })

  it("quotes commas, quotes, and line breaks", () => {
    expect(escapeCsvCell('value, with "quotes"\nand a line')).toBe(
      '"value, with ""quotes""\nand a line"',
    )
  })

  it("leaves ordinary values unchanged", () => {
    expect(escapeCsvCell("confirmed")).toBe("confirmed")
  })
})
