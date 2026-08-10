import { describe, expect, it } from "vitest"

import { setValueAtPath } from "./normalized-path.js"

describe("setValueAtPath", () => {
  it("creates nested objects", () => {
    const target = {}

    setValueAtPath(target, "patient.name.family", "Lopez")

    expect(target).toEqual({ patient: { name: { family: "Lopez" } } })
  })

  it("creates array entries and nested values", () => {
    const target = {}

    setValueAtPath(target, "patient.identifiers[0].value", "MRN-1")
    setValueAtPath(target, "patient.identifiers[0].type", "MR")
    setValueAtPath(target, "patient.identifiers[1]", { value: "EPI-1" })

    expect(target).toEqual({
      patient: {
        identifiers: [{ value: "MRN-1", type: "MR" }, { value: "EPI-1" }],
      },
    })
  })

  it("preserves existing objects and arrays", () => {
    const target: Record<string, unknown> = {
      patient: { identifiers: [{ value: "MRN-1" }] },
    }

    setValueAtPath(target, "patient.identifiers[0].type", "MR")

    expect(target).toEqual({
      patient: { identifiers: [{ value: "MRN-1", type: "MR" }] },
    })
  })
})
