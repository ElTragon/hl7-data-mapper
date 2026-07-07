import {
  canExecuteClientProfile,
  sortHl7ItemsForExecution,
} from "@hl7-data-mapper/contracts"
import { describe, expect, it } from "vitest"

import {
  defaultOmlO21ClientProfile,
  defaultOmlO21Items,
} from "./default-oml-o21-profile.js"

describe("default OML O21 profile", () => {
  it("defines a published executable default profile", () => {
    expect(defaultOmlO21ClientProfile.status).toBe("published")
    expect(defaultOmlO21ClientProfile.hl7Version).toBe("2.5.1")
    expect(defaultOmlO21ClientProfile.messageType).toBe("OML^O21")
    expect(defaultOmlO21ClientProfile.messageStructure).toBe("OML_O21")
    expect(canExecuteClientProfile(defaultOmlO21ClientProfile)).toBe(true)
  })

  it("covers the MVP review sections", () => {
    const sections = new Set(
      defaultOmlO21ClientProfile.itemSet.items.map((item) => item.section),
    )

    expect(sections).toEqual(
      new Set(["sender", "patient", "coverage", "guarantor", "labOrders"]),
    )
  })

  it("keeps item execution order deterministic", () => {
    const sortedIds = sortHl7ItemsForExecution(defaultOmlO21Items).map(
      (item) => item.id,
    )

    expect(sortedIds).toEqual(defaultOmlO21Items.map((item) => item.id))
  })

  it("includes required patient and order mappings", () => {
    const requiredTargets = defaultOmlO21ClientProfile.itemSet.items
      .filter((item) => item.required)
      .map((item) => item.targetPath)

    expect(requiredTargets).toContain("patient.identifiers[0]")
    expect(requiredTargets).toContain("patient.name")
    expect(requiredTargets).toContain("patient.dateOfBirth")
    expect(requiredTargets).toContain("labOrders")
  })
})
