import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import {
  ClientProfileSchema,
  createSourceReference,
} from "@hl7-data-mapper/contracts"
import { describe, expect, it } from "vitest"

import { executeMapping } from "./execute-mapping.js"
import { defaultOmlO21ClientProfile } from "./profiles/default-oml-o21-profile.js"
import {
  applyReviewFieldCorrectionToProfile,
  buildReviewableFields,
  confirmReviewableField,
  markReviewableFieldIncorrect,
  markReviewableFieldUnavailable,
  selectAlternateSourceForReviewableField,
} from "./review-fields.js"

const sampleMessage = `MSH|^~\\&|NORTHSTAR_LIS|NORTHSTAR_LAB|HL7_MAPPER|DEMO_FACILITY|20260706101500-0700||OML^O21^OML_O21|MSG-20260706-0001|P|2.5.1|||AL|NE|USA|ASCII
PID|1||MRN-104892^^^NORTHSTAR_LAB^MR||Lopez^Elena^M||19870514|F
IN1|1|COMMERCIAL^Commercial Plan^HL70072|INS-7788|Northstar Health Plan||||GROUP-22||||||||Lopez^Elena|SEL^Self|19870514||||||||||||||||POL-445566
GT1|1|G-1001^^^NORTHSTAR_LAB^PI|Lopez^Elena^M||100 Main St^^Denver^CO^80202^USA||3035550199||19870514|F|P/F|SEL^Self
ORC|NW|ORD-90017^NORTHSTAR_LIS|FILL-41220^NORTHSTAR_LAB||SC||||20260706101000-0700|||12345^Patel^Anika^^^^MD
OBR|1|ORD-90017^NORTHSTAR_LIS|FILL-41220^NORTHSTAR_LAB|57021-8^CBC W Auto Differential panel^LN||||||||||||12345^Patel^Anika^^^^MD
TQ1|1||||||20260706103000-0700|20260706104500-0700|R^Routine
SPM|1|SP-7788&SPF-7788|SP-7788^NORTHSTAR_LIS|BLD^Blood^HL70487|||||||P^Patient specimen||||||20260706100000-0700&20260706100500-0700|20260706102000-0700|||||||||TUBE^Tube^HL70376`

describe("review fields", () => {
  it("builds reviewable fields from mapping output, profile items, and source evidence", () => {
    const mappingResult = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile: defaultOmlO21ClientProfile,
    })

    const fields = buildReviewableFields({
      mappingResult,
      profile: defaultOmlO21ClientProfile,
    })

    const patientNameField = fields.find(
      (field) => field.normalizedPath === "patient.name",
    )

    expect(patientNameField).toMatchObject({
      id: "patient-name",
      stepId: "patient",
      section: "patient",
      label: "Patient name",
      value: null,
      hl7ItemId: "patient-name",
      reviewStatus: "unreviewed",
    })
    expect(patientNameField?.primarySource?.path).toBe("PID-5.1")
    expect(patientNameField?.rawSegment).toContain("PID|1||")
    expect(patientNameField?.sourceCandidates[0]).toMatchObject({
      previewValue: "Lopez",
      reason: 'Source read for "Patient name".',
    })
  })

  it("groups coverage and guarantor fields into the same review step", () => {
    const mappingResult = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile: defaultOmlO21ClientProfile,
    })

    const fields = buildReviewableFields({
      mappingResult,
      profile: defaultOmlO21ClientProfile,
    })

    expect(
      fields.find((field) => field.normalizedPath === "coverages")?.stepId,
    ).toBe("coverageGuarantor")
    expect(
      fields.find((field) => field.normalizedPath === "guarantor")?.stepId,
    ).toBe("coverageGuarantor")
  })

  it("groups lab order fields into the lab orders review step", () => {
    const mappingResult = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile: defaultOmlO21ClientProfile,
    })

    const fields = buildReviewableFields({
      mappingResult,
      profile: defaultOmlO21ClientProfile,
    })

    expect(
      fields.find((field) => field.normalizedPath === "labOrders")?.stepId,
    ).toBe("labOrders")
  })

  it("updates review status without changing the extracted value", () => {
    const mappingResult = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile: defaultOmlO21ClientProfile,
    })
    const [field] = buildReviewableFields({
      mappingResult,
      profile: defaultOmlO21ClientProfile,
    })

    if (!field) {
      throw new Error("Expected at least one review field.")
    }

    expect(confirmReviewableField(field)).toMatchObject({
      value: field.value,
      reviewStatus: "confirmed",
      correctionIntent: null,
    })

    expect(markReviewableFieldIncorrect(field, "Wrong source.")).toMatchObject({
      value: field.value,
      reviewStatus: "incorrect",
      correctionIntent: {
        targetHl7ItemId: field.hl7ItemId,
        notes: "Wrong source.",
      },
    })

    expect(markReviewableFieldUnavailable(field)).toMatchObject({
      value: field.value,
      reviewStatus: "unavailable",
      correctionIntent: {
        targetHl7ItemId: field.hl7ItemId,
        replacementSource: null,
      },
    })
  })

  it("records a selected alternate HL7 source as a correction intent", () => {
    const mappingResult = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile: defaultOmlO21ClientProfile,
    })
    const field = buildReviewableFields({
      mappingResult,
      profile: defaultOmlO21ClientProfile,
    }).find((candidate) => candidate.normalizedPath === "patient.name")

    if (!field) {
      throw new Error("Expected patient.name review field.")
    }

    const replacementSource = createSourceReference({
      segment: "PID",
      field: 5,
      component: 2,
      raw: "Lopez^Elena^M",
    })

    const correctedField = selectAlternateSourceForReviewableField({
      field,
      replacementSource,
      rawSegment: field.rawSegment,
      previewValue: "Elena",
      notes: "Client wants the given name source for this demo correction.",
    })

    expect(correctedField.value).toBe(field.value)
    expect(correctedField.reviewStatus).toBe("incorrect")
    expect(correctedField.correctionIntent).toMatchObject({
      targetHl7ItemId: "patient-name",
      replacementSource: {
        path: "PID-5.2",
      },
      notes: "Client wants the given name source for this demo correction.",
    })
    expect(
      correctedField.sourceCandidates.some(
        (candidate) => candidate.source.path === "PID-5.2",
      ),
    ).toBe(true)
  })

  it("applies a selected source correction to the linked hl7Item", () => {
    const draftProfile = ClientProfileSchema.parse({
      ...defaultOmlO21ClientProfile,
      status: "draft",
      publishedAt: undefined,
    })
    const mappingResult = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile: draftProfile,
    })
    const field = buildReviewableFields({
      mappingResult,
      profile: draftProfile,
    }).find((candidate) => candidate.normalizedPath === "patient.name")

    if (!field) {
      throw new Error("Expected patient.name review field.")
    }

    const correctedField = selectAlternateSourceForReviewableField({
      field,
      replacementSource: createSourceReference({
        segment: "PID",
        field: 5,
        component: 2,
      }),
      notes: "Use PID-5.2 for this client profile.",
    })

    const updatedProfile = applyReviewFieldCorrectionToProfile({
      profile: draftProfile,
      field: correctedField,
      updatedAt: "2026-07-07T16:45:00-07:00",
    })
    const updatedItem = updatedProfile.itemSet.items.find(
      (item) => item.id === "patient-name",
    )

    expect(updatedProfile.updatedAt).toBe("2026-07-07T16:45:00-07:00")
    expect(updatedItem?.sources.map((source) => source.path)).toEqual([
      "PID-5.2",
    ])
    expect(updatedItem?.notes).toContain("Use PID-5.2 for this client profile.")

    const rerun = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile: updatedProfile,
    })
    const patientNameTrace = rerun.executionTrace.find(
      (entry) => entry.itemId === "patient-name",
    )

    expect(patientNameTrace?.sourceReads[0]).toMatchObject({
      source: {
        path: "PID-5.2",
      },
      value: "Elena",
    })
  })
})
