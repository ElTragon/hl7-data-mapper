import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import {
  ClientProfileSchema,
  createSourceReference,
} from "@hl7-data-mapper/contracts"
import { describe, expect, it } from "vitest"

import { executeMapping } from "./execute-mapping.js"
import { defaultOmlO21ClientProfile } from "./profiles/default-oml-o21-profile.js"
import {
  applyReviewCorrectionAndRerunMapping,
  applyReviewFieldCorrectionToProfile,
  buildReviewableFields,
  buildGuidedReviewNavigation,
  buildWarningReviewFields,
  calculateGuidedReviewProgress,
  confirmReviewableField,
  markReviewableFieldIncorrect,
  markReviewableFieldUnavailable,
  selectAlternateSourceForReviewableField,
  selectCompositeSourceForReviewableField,
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
      value: {
        family: "Lopez",
        given: "Elena",
        middle: "M",
      },
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

    expect(
      markReviewableFieldIncorrect(field, {
        reasonCode: "wrong_source_mapping",
        reviewNote: "Wrong source.",
      }),
    ).toMatchObject({
      value: field.value,
      reviewStatus: "incorrect",
      reasonCode: "wrong_source_mapping",
      reviewNote: "Wrong source.",
      correctionIntent: {
        targetHl7ItemId: field.hl7ItemId,
      },
    })

    expect(markReviewableFieldUnavailable(field)).toMatchObject({
      value: field.value,
      reviewStatus: "unavailable",
      reasonCode: null,
      reviewNote: null,
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

  it("applies a correction and reruns mapping in one deterministic review flow", () => {
    const draftProfile = ClientProfileSchema.parse({
      ...defaultOmlO21ClientProfile,
      status: "draft",
      publishedAt: undefined,
    })
    const parsedMessage = parseHl7Message(sampleMessage)
    const firstRun = executeMapping({
      parsedMessage,
      profile: draftProfile,
    })
    const field = buildReviewableFields({
      mappingResult: firstRun,
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
    })

    const result = applyReviewCorrectionAndRerunMapping({
      parsedMessage,
      profile: draftProfile,
      field: correctedField,
      updatedAt: "2026-07-07T17:00:00-07:00",
    })

    expect(result.profile.updatedAt).toBe("2026-07-07T17:00:00-07:00")
    expect(
      result.mappingResult.executionTrace.find(
        (entry) => entry.itemId === "patient-name",
      )?.sourceReads[0],
    ).toMatchObject({
      source: {
        path: "PID-5.2",
      },
      value: "Elena",
    })
    expect(
      result.reviewFields.find(
        (reviewField) => reviewField.normalizedPath === "patient.name",
      )?.primarySource?.path,
    ).toBe("PID-5.2")
  })

  it("applies a composite person-name source correction without dropping other name parts", () => {
    const draftProfile = ClientProfileSchema.parse({
      ...defaultOmlO21ClientProfile,
      status: "draft",
      publishedAt: undefined,
    })
    const parsedMessage = parseHl7Message(
      sampleMessage.replace(
        /^PID.*$/m,
        "PID|1|Maria|MRN-104892^^^NORTHSTAR_LAB^MR||Lopez^Elena||19870514|F",
      ),
    )
    const firstRun = executeMapping({
      parsedMessage,
      profile: draftProfile,
    })
    const field = buildReviewableFields({
      mappingResult: firstRun,
      profile: draftProfile,
    }).find((candidate) => candidate.normalizedPath === "patient.name")

    if (!field) {
      throw new Error("Expected patient.name review field.")
    }

    const correctedField = selectCompositeSourceForReviewableField({
      profile: draftProfile,
      field,
      replacementSource: createSourceReference({
        segment: "PID",
        field: 2,
        component: 1,
      }),
      sourceRole: "middle",
      notes: "Client sends middle name in PID-2.1.",
    })
    const result = applyReviewCorrectionAndRerunMapping({
      parsedMessage,
      profile: draftProfile,
      field: correctedField,
      updatedAt: "2026-07-07T17:15:00-07:00",
    })
    const updatedItem = result.profile.itemSet.items.find(
      (item) => item.id === "patient-name",
    )

    expect(updatedItem?.sources.map((source) => source.path)).toEqual([
      "PID-5.1",
      "PID-5.2",
      "PID-5.4",
      "PID-5.5",
      "PID-2.1",
    ])
    expect(updatedItem?.transform?.params).toMatchObject({
      sourceRoles: expect.arrayContaining([
        expect.objectContaining({ path: "PID-5.1", role: "family" }),
        expect.objectContaining({ path: "PID-5.2", role: "given" }),
        expect.objectContaining({ path: "PID-2.1", role: "middle" }),
      ]),
    })
    expect(result.mappingResult.normalizedDraft).toMatchObject({
      patient: {
        name: {
          family: "Lopez",
          given: "Elena",
          middle: "Maria",
        },
      },
    })
  })

  it("calculates progress and guided navigation by review section", () => {
    const mappingResult = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile: defaultOmlO21ClientProfile,
    })
    const fields = buildReviewableFields({
      mappingResult,
      profile: defaultOmlO21ClientProfile,
    })
    const updatedFields = fields.map((field) => {
      if (field.stepId === "patient") {
        return confirmReviewableField(field)
      }

      return field
    })
    const patientFields = updatedFields.filter(
      (field) => field.stepId === "patient",
    )
    const patientProgress = calculateGuidedReviewProgress(patientFields)
    const navigation = buildGuidedReviewNavigation({
      fields: updatedFields,
      activeStepId: "patient",
    })

    expect(patientProgress).toMatchObject({
      total: patientFields.length,
      confirmed: patientFields.length,
      unreviewed: 0,
    })
    expect(
      navigation.steps.find((step) => step.id === "patient"),
    ).toMatchObject({
      title: "Patient information",
      isComplete: true,
    })
    expect(navigation.nextStepId).toBe("sender")
  })

  it("creates warning review fields for missing fields and validation issues", () => {
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
    const mappingResult = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile,
    })
    const warningFields = buildWarningReviewFields(mappingResult)
    const allReviewFields = buildReviewableFields({
      mappingResult,
      profile,
    })

    expect(warningFields[0]).toMatchObject({
      stepId: "warnings",
      section: "exceptions",
      normalizedPath: "patient.missing",
      label: "Review patient.missing",
      value:
        'Required mapping item "Required missing field" did not produce a value.',
      reviewStatus: "unreviewed",
    })
    expect(warningFields[0]?.validation[0]?.severity).toBe("error")
    expect(allReviewFields.some((field) => field.stepId === "warnings")).toBe(
      true,
    )
  })

  it("creates warning review fields for optional missing HL7 sources", () => {
    const profile = ClientProfileSchema.parse({
      ...defaultOmlO21ClientProfile,
      itemSet: {
        ...defaultOmlO21ClientProfile.itemSet,
        items: [
          {
            id: "optional-missing-field",
            clientId: defaultOmlO21ClientProfile.clientId,
            sequence: 1,
            section: "patient",
            targetPath: "patient.optional",
            label: "Optional missing field",
            action: "extract",
            sources: [
              createSourceReference({
                segment: "PID",
                field: 98,
              }),
            ],
            required: false,
          },
        ],
      },
    })
    const mappingResult = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile,
    })
    const warningFields = buildWarningReviewFields(mappingResult)

    expect(warningFields[0]).toMatchObject({
      stepId: "warnings",
      section: "exceptions",
      normalizedPath: "patient.optional",
      label: "Review patient.optional source",
      hl7ItemId: "optional-missing-field",
      primarySource: {
        path: "PID-98",
      },
      reviewStatus: "unreviewed",
    })
    expect(warningFields[0]?.validation[0]).toMatchObject({
      code: "source-read-missing_field",
      severity: "warning",
      fieldKey: "patient.optional",
    })
  })

  it("creates informational review fields for blank optional components", () => {
    const parsedMessage = parseHl7Message(
      sampleMessage
        .replace(
          /^PID.*$/m,
          "PID|1||MRN-104892^^^NORTHSTAR_LAB^MR||Lopez^Elena^M||19870514|F|||742 Evergreen Ave^^Los Angeles^CA^90017^USA||^PRN^PH^^^213^5550142",
        )
        .replace(/^TQ1.*$/m, "TQ1|1||||||20260706103000-0700||R^Routine"),
    )
    const mappingResult = executeMapping({
      parsedMessage,
      profile: defaultOmlO21ClientProfile,
    })
    const warningFields = buildWarningReviewFields(mappingResult)

    expect(sourceSeverity(warningFields, "PID-5.4")).toBe("info")
    expect(sourceSeverity(warningFields, "PID-5.5")).toBe("info")
    expect(sourceSeverity(warningFields, "PID-13.5")).toBe("info")
    expect(sourceSeverity(warningFields, "TQ1-8")).toBe("info")
    expect(sourceValue(warningFields, "PID-5.4")).toContain(
      "Expected patient name suffix at PID-5.4.",
    )
    expect(sourceValue(warningFields, "PID-5.4")).toContain(
      "Usually safe to ignore unless this client sends suffixes.",
    )
  })

  it("does not mark core patient-name components as safe to ignore", () => {
    const parsedMessage = parseHl7Message(
      sampleMessage.replace(
        /^PID.*$/m,
        "PID|1||MRN-104892^^^NORTHSTAR_LAB^MR||^Elena^M||19870514|F",
      ),
    )
    const mappingResult = executeMapping({
      parsedMessage,
      profile: defaultOmlO21ClientProfile,
    })
    const warningFields = buildWarningReviewFields(mappingResult)

    expect(sourceSeverity(warningFields, "PID-5.1")).toBe("warning")
    expect(sourceSeverity(warningFields, "PID-5.4")).toBe("info")
    expect(sourceSeverity(warningFields, "PID-5.5")).toBe("info")
  })

  it("marks the warnings step as blocking when it contains validation errors", () => {
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
    const mappingResult = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile,
    })
    const navigation = buildGuidedReviewNavigation({
      fields: buildReviewableFields({
        mappingResult,
        profile,
      }),
      activeStepId: "warnings",
    })

    expect(
      navigation.steps.find((step) => step.id === "warnings"),
    ).toMatchObject({
      hasBlockingIssues: true,
      progress: {
        total: 1,
        unreviewed: 1,
      },
    })
  })

  it("rejects alternate-source selection for review fields without an hl7Item", () => {
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
    const mappingResult = executeMapping({
      parsedMessage: parseHl7Message(sampleMessage),
      profile,
    })
    const warningField = buildWarningReviewFields(mappingResult).find(
      (field) => field.hl7ItemId === null,
    )

    if (!warningField) {
      throw new Error("Expected a warning review field without an hl7Item.")
    }

    expect(() =>
      selectAlternateSourceForReviewableField({
        field: warningField,
        replacementSource: createSourceReference({
          segment: "PID",
          field: 5,
          component: 1,
        }),
      }),
    ).toThrow("not linked to an hl7Item")
  })

  it("rejects applying corrections to published profiles", () => {
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

    const correctedField = selectAlternateSourceForReviewableField({
      field,
      replacementSource: createSourceReference({
        segment: "PID",
        field: 5,
        component: 2,
      }),
    })

    expect(() =>
      applyReviewFieldCorrectionToProfile({
        profile: defaultOmlO21ClientProfile,
        field: correctedField,
        updatedAt: "2026-07-07T17:20:00-07:00",
      }),
    ).toThrow("cannot be edited")
  })
})

function sourceSeverity(
  fields: ReturnType<typeof buildWarningReviewFields>,
  sourcePath: string,
) {
  const field = fields.find(
    (candidate) => candidate.primarySource?.path === sourcePath,
  )

  if (!field) {
    throw new Error(`Expected warning review field for ${sourcePath}.`)
  }

  return field.validation[0]?.severity
}

function sourceValue(
  fields: ReturnType<typeof buildWarningReviewFields>,
  sourcePath: string,
) {
  const field = fields.find(
    (candidate) => candidate.primarySource?.path === sourcePath,
  )

  if (!field) {
    throw new Error(`Expected warning review field for ${sourcePath}.`)
  }

  return String(field.value)
}
