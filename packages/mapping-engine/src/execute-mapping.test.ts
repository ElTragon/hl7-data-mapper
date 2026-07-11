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

  it("returns identical output and trace for repeated runs", () => {
    const parsedMessage = parseHl7Message(sampleMessage)
    const firstRun = executeMapping({
      parsedMessage,
      profile: defaultOmlO21ClientProfile,
    })
    const secondRun = executeMapping({
      parsedMessage,
      profile: defaultOmlO21ClientProfile,
    })

    expect(secondRun.normalizedDraft).toEqual(firstRun.normalizedDraft)
    expect(secondRun.executionTrace).toEqual(firstRun.executionTrace)
    expect(secondRun.validation).toEqual(firstRun.validation)
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

  it("maps person-name parts from configured sources across PID fields", () => {
    const parsedMessage = parseHl7Message(
      sampleMessage.replace(
        /^PID.*$/m,
        "PID|1|Maria|MRN-104892^^^NORTHSTAR_LAB^MR||Lopez^Elena||19870514|F",
      ),
    )
    const patientNameItem = defaultOmlO21ClientProfile.itemSet.items.find(
      (item) => item.id === "patient-name",
    )

    if (!patientNameItem) {
      throw new Error("Expected patient-name item.")
    }

    const profile = ClientProfileSchema.parse({
      ...defaultOmlO21ClientProfile,
      itemSet: {
        ...defaultOmlO21ClientProfile.itemSet,
        items: defaultOmlO21ClientProfile.itemSet.items.map((item) =>
          item.id === "patient-name"
            ? {
                ...patientNameItem,
                sources: [
                  createSourceReference({
                    segment: "PID",
                    field: 5,
                    component: 1,
                  }),
                  createSourceReference({
                    segment: "PID",
                    field: 5,
                    component: 2,
                  }),
                  createSourceReference({
                    segment: "PID",
                    field: 2,
                    component: 1,
                  }),
                ],
                sourceExpectations: [
                  ...patientNameItem.sourceExpectations.filter((expectation) =>
                    ["PID-5.1", "PID-5.2"].includes(expectation.path),
                  ),
                  {
                    path: "PID-2.1",
                    expectedLabel: "Patient middle name or initial",
                    requiredness: "optional",
                    examples: ["Maria"],
                    emptyMeaning:
                      "No middle name or initial was present in PID-2.1.",
                    guidance:
                      "Usually safe to ignore unless this client relies on middle names for matching.",
                  },
                ],
                transform: {
                  name: "mapXpnName",
                  params: {
                    sourceRoles: [
                      {
                        path: "PID-5.1",
                        segmentIndex: null,
                        role: "family",
                      },
                      {
                        path: "PID-5.2",
                        segmentIndex: null,
                        role: "given",
                      },
                      {
                        path: "PID-2.1",
                        segmentIndex: null,
                        role: "middle",
                      },
                    ],
                  },
                },
              }
            : item,
        ),
      },
    })
    const result = executeMapping({
      parsedMessage,
      profile,
    })

    expect(result.normalizedDraft).toMatchObject({
      patient: {
        name: {
          family: "Lopez",
          given: "Elena",
          middle: "Maria",
        },
      },
    })
  })

  it("maps the patient MRN from the preferred PID-3 identifier type", () => {
    const parsedMessage = parseHl7Message(
      sampleMessage.replace(
        /^PID.*$/m,
        "PID|1|Maria|MRN-104892^^^NORTHSTAR_LAB^MR||Lopez^Elena||19870514|F",
      ),
    )
    const result = executeMapping({
      parsedMessage,
      profile: defaultOmlO21ClientProfile,
    })
    const identifierField = result.normalizedFields.find(
      (field) => field.key === "patient.identifiers[0]",
    )
    const identifierTrace = result.executionTrace.find(
      (entry) => entry.itemId === "patient-identifier-mrn",
    )

    expect(result.normalizedDraft).toMatchObject({
      patient: {
        identifiers: [
          {
            value: "MRN-104892",
            assigningAuthority: "NORTHSTAR_LAB",
            type: "MR",
          },
        ],
      },
    })
    expect(identifierField?.value).toEqual({
      value: "MRN-104892",
      assigningAuthority: "NORTHSTAR_LAB",
      type: "MR",
    })
    expect(identifierTrace?.status).toBe("completed")
  })

  it("prefers the MR PID-3 repetition when another identifier appears first", () => {
    const parsedMessage = parseHl7Message(
      sampleMessage.replace(
        /^PID.*$/m,
        "PID|1||EPI-778899^^^METRO_HIE^PI~MRN-778899^^^RIVER_CLINIC^MR||Nguyen^Avery||19920309|O",
      ),
    )
    const result = executeMapping({
      parsedMessage,
      profile: defaultOmlO21ClientProfile,
    })

    expect(result.normalizedDraft).toMatchObject({
      patient: {
        identifiers: [
          {
            value: "MRN-778899",
            assigningAuthority: "RIVER_CLINIC",
            type: "MR",
          },
        ],
      },
    })
  })

  it("assembles composite patient address values from source fields", () => {
    const parsedMessage = parseHl7Message(
      sampleMessage.replace(
        /^PID.*$/m,
        "PID|1|Maria|MRN-104892^^^NORTHSTAR_LAB^MR||Lopez^Elena||19870514|F|||742 Evergreen Ave^^Los Angeles^CA^90017^USA||^PRN^PH^^^213^5550142",
      ),
    )
    const result = executeMapping({
      parsedMessage,
      profile: defaultOmlO21ClientProfile,
    })
    const addressField = result.normalizedFields.find(
      (field) => field.key === "patient.addresses",
    )
    const addressTrace = result.executionTrace.find(
      (entry) => entry.itemId === "patient-addresses",
    )

    expect(result.normalizedDraft).toMatchObject({
      patient: {
        addresses: [
          {
            street: "742 Evergreen Ave",
            city: "Los Angeles",
            state: "CA",
            postalCode: "90017",
            country: "USA",
          },
        ],
      },
    })
    expect(addressField?.value).toMatchObject([
      {
        street: "742 Evergreen Ave",
        city: "Los Angeles",
      },
    ])
    expect(addressTrace?.status).toBe("completed")
    expect(addressTrace?.sourceReads.map((read) => read.status)).toEqual([
      "found",
      "found",
      "found",
      "found",
      "found",
    ])
  })

  it("includes source-read evidence in the execution trace", () => {
    const result = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile: defaultOmlO21ClientProfile,
    })

    const messageTypeTrace = result.executionTrace.find(
      (entry) => entry.itemId === "message-type",
    )

    expect(messageTypeTrace?.sourceReads[0]).toMatchObject({
      value: "OML",
      status: "found",
      segmentIndex: 0,
      rawField: "OML^O21^OML_O21",
    })
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

  it("returns validation errors for missing required source values", () => {
    const profile = ClientProfileSchema.parse({
      ...defaultOmlO21ClientProfile,
      itemSet: {
        ...defaultOmlO21ClientProfile.itemSet,
        items: [
          {
            id: "required-missing-field",
            clientId: defaultOmlO21ClientProfile.clientId,
            sequence: 1,
            section: "patient",
            targetPath: "patient.missing",
            label: "Required missing field",
            action: "extract",
            sources: [
              createSourceReference({
                segment: "PID",
                field: 99,
              }),
            ],
            required: true,
          },
        ],
      },
    })

    const result = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile,
    })

    expect(result.validation.errors).toHaveLength(1)
    expect(result.executionTrace[0]?.sourceReads[0]?.status).toBe(
      "missing_field",
    )
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
