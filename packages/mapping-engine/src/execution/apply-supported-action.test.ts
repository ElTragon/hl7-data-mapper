import { createSourceReference, type Hl7Item } from "@hl7-data-mapper/contracts"
import { describe, expect, it } from "vitest"

import { applySupportedAction } from "./apply-supported-action.js"

function item(overrides: Partial<Hl7Item>): Hl7Item {
  return {
    id: "test-item",
    clientId: "test-client",
    sequence: 1,
    section: "patient",
    targetPath: "patient.test",
    label: "Test item",
    action: "extract",
    sources: [],
    sourceExpectations: [],
    dependsOn: [],
    required: false,
    reviewRequired: true,
    valueType: "unknown",
    defaultValue: null,
    transform: null,
    ...overrides,
  }
}

describe("applySupportedAction", () => {
  it("handles primitive mapping actions", () => {
    expect(applySupportedAction(item({}), ["value"], [])).toBe("value")
    expect(
      applySupportedAction(item({ action: "extract" }), ["one", "two"], []),
    ).toEqual(["one", "two"])
    expect(
      applySupportedAction(item({ action: "join" }), ["one", null, "two"], []),
    ).toBe("onetwo")
  })

  it("handles default and temporal actions", () => {
    expect(
      applySupportedAction(
        item({ action: "default_value", defaultValue: "USA" }),
        [],
        [],
      ),
    ).toBe("USA")
    expect(
      applySupportedAction(
        item({ action: "normalize_date" }),
        ["19870514"],
        [],
      ),
    ).toBe("1987-05-14")
    expect(
      applySupportedAction(
        item({ action: "normalize_timestamp" }),
        ["20260706101500-0700"],
        [],
      ),
    ).toBe("2026-07-06T10:15:00-07:00")
  })

  it("returns null when an extract action has no input", () => {
    expect(applySupportedAction(item({}), [], [])).toBeNull()
  })

  it("requires every source in a combined value while preserving dependency joins", () => {
    const firstSource = createSourceReference({ segment: "MSH", field: 3 })
    const secondSource = createSourceReference({ segment: "PID", field: 3 })
    const combinedItem = item({
      action: "join",
      sources: [firstSource, secondSource],
      joinSeparator: " / ",
    })

    expect(
      applySupportedAction(combinedItem, ["NORTHSTAR_LIS", "104892"], []),
    ).toBe("NORTHSTAR_LIS / 104892")
    expect(
      applySupportedAction(combinedItem, ["NORTHSTAR_LIS", null], []),
    ).toBeNull()
    expect(
      applySupportedAction(
        item({ action: "join", dependsOn: ["first", "second"] }),
        ["NORTHSTAR_LIS", null],
        [],
      ),
    ).toBe("NORTHSTAR_LIS")
  })
})
