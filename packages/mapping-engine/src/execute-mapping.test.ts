import {
  ClientProfileSchema,
  createSourceReference,
} from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"

import { executeMapping } from "./execute-mapping.js"
import { defaultOmlO21ClientProfile } from "./profiles/default-oml-o21-profile.js"

const sampleMessage = `MSH|^~\\&|NORTHSTAR_LIS|NORTHSTAR_LAB|HL7_MAPPER|DEMO_FACILITY|20260706101500-0700||OML^O21^OML_O21|MSG-20260706-0001|P|2.5.1|||AL|NE|USA|ASCII
PID|1||MRN-104892^^^NORTHSTAR_LAB^MR||Lopez^Elena^M||19870514|F
ORC|NW|ORD-90017^NORTHSTAR_LIS|FILL-41220^NORTHSTAR_LAB||SC||||20260706101000-0700|||12345^Patel^Anika^^^^MD
OBR|1|ORD-90017^NORTHSTAR_LIS|FILL-41220^NORTHSTAR_LAB|57021-8^CBC W Auto Differential panel^LN`

describe("executeMapping", () => {
  it("executes profile items in deterministic sequence order", () => {
    const result = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile: defaultOmlO21ClientProfile,
    })

    expect(result.executionTrace.map((entry) => entry.sequence)).toEqual(
      [...result.executionTrace.map((entry) => entry.sequence)].sort(
        (left, right) => left - right,
      ),
    )
  })

  it("reads source values and builds a normalized draft", () => {
    const result = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile: defaultOmlO21ClientProfile,
    })

    expect(result.normalizedDraft).toMatchObject({
      message: {
        sentAt: "2026-07-06T10:15:00-07:00",
        type: "OML",
        triggerEvent: "O21",
        structure: "OML_O21",
        controlId: "MSG-20260706-0001",
        processingId: "P",
        version: "2.5.1",
      },
      sender: {
        application: {
          namespaceId: "NORTHSTAR_LIS",
        },
        facility: {
          namespaceId: "NORTHSTAR_LAB",
        },
      },
      patient: {
        dateOfBirth: "1987-05-14",
        administrativeSex: "F",
      },
    })
  })

  it("captures review-ready normalized fields", () => {
    const result = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile: defaultOmlO21ClientProfile,
    })

    const messageTypeField = result.normalizedFields.find(
      (field) => field.key === "message.type",
    )

    expect(messageTypeField).toMatchObject({
      key: "message.type",
      label: "Message type",
      value: "OML",
      reviewStatus: "unreviewed",
    })
    expect(messageTypeField?.sources[0]?.path).toBe("MSH-9.1")
  })

  it("returns validation errors for profile mismatches", () => {
    const badProfile = ClientProfileSchema.parse({
      ...defaultOmlO21ClientProfile,
      itemSet: {
        ...defaultOmlO21ClientProfile.itemSet,
        items: [
          {
            id: "message-type",
            clientId: defaultOmlO21ClientProfile.clientId,
            sequence: 1,
            section: "sender",
            targetPath: "message.type",
            label: "Message type",
            action: "validate",
            sources: [
              createSourceReference({
                segment: "MSH",
                field: 9,
                component: 1,
              }),
            ],
            required: true,
            transform: {
              name: "mustEqual",
              params: { expected: "ADT" },
            },
          },
        ],
      },
    })

    const result = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile: badProfile,
    })

    expect(result.validation.errors).toHaveLength(1)
    expect(result.executionTrace[0]?.status).toBe("error")
  })

  it("rejects archived profiles", () => {
    const archivedProfile = ClientProfileSchema.parse({
      ...defaultOmlO21ClientProfile,
      status: "archived",
      archivedAt: "2026-07-07T01:00:00-07:00",
    })

    expect(() =>
      executeMapping({
        parsedMessage: parseHl7Message(sampleMessage),
        profile: archivedProfile,
      }),
    ).toThrow()
  })
})
