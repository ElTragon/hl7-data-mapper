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

  it("does not traverse inherited values", () => {
    const inheritedPatient = { name: { family: "Inherited" } }
    let inheritedSetterCalled = false
    const prototype = Object.create(null) as Record<string, unknown>
    Object.defineProperty(prototype, "patient", {
      configurable: true,
      get: () => inheritedPatient,
      set: () => {
        inheritedSetterCalled = true
      },
    })
    const target = Object.create(prototype) as Record<string, unknown>

    setValueAtPath(target, "patient.name.given", "Elena")

    expect(Object.hasOwn(target, "patient")).toBe(true)
    expect(target["patient"]).toEqual({ name: { given: "Elena" } })
    expect(inheritedPatient).toEqual({ name: { family: "Inherited" } })
    expect(inheritedSetterCalled).toBe(false)
  })

  it("does not invoke own accessors while traversing", () => {
    const target = {}
    const exoticValue = {}
    let getterCalls = 0

    Object.defineProperty(exoticValue, "bridge", {
      configurable: true,
      get: () => {
        getterCalls += 1
        return Object.prototype
      },
    })

    setValueAtPath(target, "patient.container", exoticValue)
    setValueAtPath(target, "patient.container.bridge.polluted", "safe")

    expect(getterCalls).toBe(0)
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false)
    expect(target).toEqual({
      patient: {
        container: {
          bridge: { polluted: "safe" },
        },
      },
    })
  })

  it("does not traverse prototype objects supplied as values", () => {
    const target = {}

    setValueAtPath(target, "patient.container", Object.prototype)
    setValueAtPath(target, "patient.container.polluted", "safe")

    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false)
    expect(target).toEqual({
      patient: { container: { polluted: "safe" } },
    })
  })

  it.each([
    "__proto__.securityRegressionPolluted",
    "patient.__proto__.securityRegressionPolluted",
    "patient.__proto__[0].securityRegressionPolluted",
    "constructor.prototype.securityRegressionPolluted",
    "patient.constructor.prototype.securityRegressionPolluted",
    "patient.prototype.securityRegressionPolluted",
    "patient.constructor[0].securityRegressionPolluted",
    "",
    ".patient.name",
    "patient.name.",
    "patient..name",
    "Patient.name",
    "patient.Name",
    "patient.identifiers[]",
    "patient.identifiers[01]",
    "patient.identifiers[-1]",
    "patient.identifiers[1.0]",
    "patient.identifiers[1][2]",
    "patient.identifiers[1024]",
    "unknownRoot.value",
  ])("rejects %s before changing any object", (path) => {
    const target = { patient: { existing: "preserved" } }
    const targetBefore = structuredClone(target)
    const objectPrototypeBefore = Object.getOwnPropertyDescriptors(
      Object.prototype,
    )

    expect(() => setValueAtPath(target, path, "unsafe")).toThrow()
    expect(target).toEqual(targetBefore)
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(
      objectPrototypeBefore,
    )
    expect(Object.hasOwn(Object.prototype, "securityRegressionPolluted")).toBe(
      false,
    )
  })
})
