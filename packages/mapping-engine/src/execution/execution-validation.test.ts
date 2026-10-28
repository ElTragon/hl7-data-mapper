import {
  ClientProfileSchema,
  createSourceReference,
  type Hl7Item,
} from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"

import { defaultOmlO21ClientProfile } from "../profiles/default-oml-o21-profile.js"
import { executeMapping } from "./execute-mapping.js"

const parsedMessage = parseHl7Message(
  [
    "MSH|^~\\&|A|B|C|D|20260706101500-0700||OML^O21^OML_O21|1|P|2.5.1",
    "PID|1||MRN^^^LAB^MR||||19870514|F",
    "ORC|NW|ORDER",
    "OBR|1|ORDER||CBC^CBC^LN",
    "SPM|1||SPECIMEN|BLD",
  ].join("\r"),
)

function executeItem(overrides: Partial<Hl7Item>) {
  return executeMapping({
    parsedMessage,
    profile: ClientProfileSchema.parse({
      ...defaultOmlO21ClientProfile,
      itemSet: {
        ...defaultOmlO21ClientProfile.itemSet,
        items: [
          {
            id: "test-item",
            clientId: defaultOmlO21ClientProfile.clientId,
            sequence: 1,
            section: "patient",
            targetPath: "patient.name",
            label: "Patient name",
            action: "extract",
            sources: [createSourceReference({ segment: "PID", field: 8 })],
            required: false,
            ...overrides,
          },
        ],
      },
    }),
  })
}

describe("mapping execution validation", () => {
  it.each(["split", "map_code", "compose"] as const)(
    "blocks an unsupported %s action instead of passing its input through",
    (action) => {
      const result = executeItem({ action })
      expect(result.executionTrace[0]).toMatchObject({
        status: "error",
        inputValues: ["F"],
        outputValue: null,
      })
      expect(result.validation.errors).toEqual([
        expect.objectContaining({ code: "unsupported-action" }),
      ])
    },
  )

  it("blocks an empty required composite name", () => {
    const result = executeItem({
      action: "compose",
      required: true,
      sources: [
        createSourceReference({ segment: "PID", field: 5, component: 1 }),
      ],
      transform: { name: "mapXpnName", params: {} },
    })
    expect(result.executionTrace[0]).toMatchObject({
      status: "error",
      outputValue: {
        family: null,
        given: null,
        middle: null,
        suffix: null,
        prefix: null,
      },
    })
    expect(result.validation.errors).toEqual([
      expect.objectContaining({ code: "missing-required-value" }),
    ])
  })

  it.each([
    { defaultValue: [] },
    { defaultValue: [null] },
    { defaultValue: { family: "   ", given: null } },
  ])("blocks required empty output $defaultValue", ({ defaultValue }) => {
    const result = executeItem({
      action: "default_value",
      defaultValue,
      required: true,
    })
    expect(result.validation.errors).toEqual([
      expect.objectContaining({ code: "missing-required-value" }),
    ])
  })

  it.each([false, 0, { value: "MRN" }])(
    "accepts present required output %j",
    (defaultValue) => {
      const result = executeItem({
        action: "default_value",
        defaultValue,
        required: true,
      })
      expect(result.validation.errors).toEqual([])
      expect(result.executionTrace[0]?.status).toBe("completed")
    },
  )
})
