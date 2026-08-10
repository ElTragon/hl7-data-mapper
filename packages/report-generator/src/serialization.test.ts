import { describe, expect, it } from "vitest"

import { getUtf8ByteLength, toPrettyJson } from "./serialization.js"

describe("report serialization", () => {
  it("pretty prints JSON with one trailing newline", () => {
    expect(toPrettyJson({ value: "test" })).toBe('{\n  "value": "test"\n}\n')
  })

  it("calculates UTF-8 byte lengths", () => {
    for (const value of ["ASCII", "café", "検査", "Reviewed 🧪"]) {
      expect(getUtf8ByteLength(value)).toBe(
        new TextEncoder().encode(value).byteLength,
      )
    }
  })
})
