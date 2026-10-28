import {
  createSourceReference,
  ClientProfileSchema,
} from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"
import { defaultOmlO21ClientProfile } from "../profiles/default-oml-o21-profile.js"
import { executeMapping } from "../execute-mapping.js"
import { buildReviewableFields } from "./build-reviewable-fields.js"
import { selectAlternateSourceForReviewableField } from "./source-selection.js"
import { applyReviewCorrectionAndRerunMapping } from "./correction-workflow.js"
import { applyReviewFieldCorrectionToProfile } from "./profile-corrections.js"

const parsedMessage = parseHl7Message(
  [
    "MSH|^~\\&|A|B|C|D|20260706101500-0700||OML^O21^OML_O21|1|P|2.5.1",
    "PID|1||MRN^^^LAB^MR||Doe^Jane||19870514|F|||First^^One^CA^90001~Second^^Two^NY^10001",
    "IN1|1|A^Plan A|INS-A|Insurer A",
    "IN1|2|B^Plan B|INS-B|Insurer B",
    "ORC|NW|ORDER-A",
    "OBR|1|ORDER-A||A^Test A^LN",
    "SPM|1||A|BLD",
    "SPM|2||A2|SER",
    "ORC|NW|ORDER-B",
    "OBR|1|ORDER-B||B^Test B^LN",
    "SPM|1||B|BLD",
  ].join("\r"),
)
const profile = ClientProfileSchema.parse({
  ...defaultOmlO21ClientProfile,
  status: "draft",
  publishedAt: null,
})

describe("record field review", () => {
  it.each([
    ["~Second^^Two^NY^10001", [2]],
    ["First^^One^CA^90001~~Second^^Two^NY^10001", [1, 3]],
  ] as const)(
    "retains actual repetition evidence for %s",
    (addresses, repetitions) => {
      const message = parseHl7Message(
        parsedMessage.normalizedText.replace(
          "First^^One^CA^90001~Second^^Two^NY^10001",
          addresses,
        ),
      )
      const mappingResult = executeMapping({ profile, parsedMessage: message })
      const fields = buildReviewableFields({ profile, mappingResult })
      repetitions.forEach((repetition, index) => {
        const field = fields.find(
          (field) =>
            field.normalizedPath === `patient.addresses[${index}].city`,
        )!
        expect(field.sourceCandidates.length).toBeGreaterThan(0)
        expect(
          field.sourceCandidates.every(
            (candidate) => candidate.source.repetition === repetition,
          ),
        ).toBe(true)
        expect(
          field.sourceCandidates.find(
            (candidate) => candidate.source.component === 3,
          )?.previewValue,
        ).toBe(field.value)
      })
    },
  )

  it("retains evidence when a profile explicitly selects the second repetition", () => {
    const selectedProfile = {
      ...profile,
      itemSet: {
        ...profile.itemSet,
        items: profile.itemSet.items.map((item) =>
          item.targetPath === "patient.addresses"
            ? {
                ...item,
                sourceExpectations: [],
                sources: item.sources.map((source) =>
                  createSourceReference({ ...source, repetition: 2 }),
                ),
              }
            : item,
        ),
      },
    }
    const mappingResult = executeMapping({
      profile: selectedProfile,
      parsedMessage,
    })
    const field = buildReviewableFields({
      profile: selectedProfile,
      mappingResult,
    }).find((field) => field.normalizedPath === "patient.addresses[0].city")!
    expect(field.value).toBe("Two")
    expect(
      field.sourceCandidates.every(
        (candidate) => candidate.source.repetition === 2,
      ),
    ).toBe(true)
    expect(field.sourceCandidates).not.toHaveLength(0)
  })

  it("does not shift specimen evidence when an empty specimen is omitted", () => {
    const message = parseHl7Message(
      parsedMessage.normalizedText.replace("SPM|1||A|BLD", "SPM|"),
    )
    const mappingResult = executeMapping({ profile, parsedMessage: message })
    const field = buildReviewableFields({ profile, mappingResult }).find(
      (field) => field.normalizedPath === "labOrders[0].specimens[0].type.code",
    )!
    expect(field.value).toBe("SER")
    expect(field.rawSegment).toBe("SPM|2||A2|SER")
  })
  it("does not offer scalar corrections for absent objects or array exceptions", () => {
    const mappingResult = executeMapping({ profile, parsedMessage })
    const fields = buildReviewableFields({ profile, mappingResult })
    for (const path of [
      "labOrders[0].orderingProvider",
      "labOrders[0].timing.priority",
      "labOrders[0].fillerOrderNumber",
    ]) {
      const field = fields.find((field) => field.normalizedPath === path)!
      expect(field).toMatchObject({ value: null, hl7ItemId: null })
      // Reject even an old saved field that still links to the parent composer.
      expect(() =>
        applyReviewFieldCorrectionToProfile({
          profile,
          updatedAt: profile.updatedAt,
          field: selectAlternateSourceForReviewableField({
            field: { ...field, hl7ItemId: "lab-order-groups" },
            replacementSource: createSourceReference({
              segment: "PID",
              field: 5,
              component: 2,
            }),
          }),
        }),
      ).toThrow("string field")
    }
    const warning = fields.find(
      (field) =>
        field.section === "exceptions" && field.normalizedPath === "labOrders",
    )!
    expect(warning).toBeDefined()
    expect(warning.hl7ItemId).toBeNull()
    expect(() =>
      applyReviewFieldCorrectionToProfile({
        profile,
        updatedAt: profile.updatedAt,
        field: selectAlternateSourceForReviewableField({
          field: { ...warning, hl7ItemId: "lab-order-groups" },
          replacementSource: createSourceReference({
            segment: "PID",
            field: 8,
          }),
        }),
      }),
    ).toThrow("individual record field")
    expect(
      fields.find(
        (field) => field.normalizedPath === "patient.addresses[0].country",
      )?.hl7ItemId,
    ).not.toBeNull()
  })
  it("keeps repeated addresses, coverage, and order groups distinct", () => {
    const result = executeMapping({ profile, parsedMessage })
    expect(result.normalizedDraft).toMatchObject({
      patient: { addresses: [{ city: "One" }, { city: "Two" }] },
      coverages: [{ insurer: { id: "INS-A" } }, { insurer: { id: "INS-B" } }],
      labOrders: [{ service: { code: "A" } }, { service: { code: "B" } }],
    })
    const fields = buildReviewableFields({ profile, mappingResult: result })
    expect(
      fields.find(
        (field) => field.normalizedPath === "labOrders[1].service.code",
      )?.rawSegment,
    ).toContain("ORDER-B")
    expect(
      fields.find(
        (field) =>
          field.normalizedPath === "labOrders[0].specimens[1].type.code",
      )?.value,
    ).toBe("SER")
    const specimenField = fields.find(
      (field) => field.normalizedPath === "labOrders[0].specimens[1].type.code",
    )!
    expect(specimenField.rawSegment).toBe("SPM|2||A2|SER")
    expect(
      specimenField.sourceCandidates.every(
        (candidate) => candidate.source.segmentIndex === 7,
      ),
    ).toBe(true)

    expect(
      fields.find(
        (field) => field.normalizedPath === "patient.addresses[1].city",
      )?.value,
    ).toBe("Two")
  })
  it("corrects one record leaf without replacing siblings and survives profile serialization", () => {
    const mappingResult = executeMapping({ profile, parsedMessage })
    const field = buildReviewableFields({ profile, mappingResult }).find(
      (field) => field.normalizedPath === "patient.addresses[1].city",
    )!
    const corrected = selectAlternateSourceForReviewableField({
      field,
      replacementSource: createSourceReference({
        segment: "PID",
        field: 11,
        repetition: 1,
        component: 3,
      }),
    })
    const result = applyReviewCorrectionAndRerunMapping({
      profile,
      parsedMessage,
      field: corrected,
      updatedAt: "2026-10-27T00:00:00Z",
    })
    expect(result.mappingResult.normalizedDraft).toMatchObject({
      patient: {
        addresses: [
          { city: "One", street: "First" },
          { city: "One", street: "Second", state: "NY" },
        ],
      },
    })
    expect(
      result.reviewFields.filter(
        (candidate) => candidate.normalizedPath === field.normalizedPath,
      ),
    ).toHaveLength(1)
    const reloaded = executeMapping({
      parsedMessage,
      profile: ClientProfileSchema.parse(
        JSON.parse(JSON.stringify(result.profile)),
      ),
    })
    expect(reloaded.normalizedDraft).toEqual(
      result.mappingResult.normalizedDraft,
    )
    const shorter = executeMapping({
      profile: result.profile,
      parsedMessage: parseHl7Message(
        parsedMessage.normalizedText.replace("~Second^^Two^NY^10001", ""),
      ),
    })
    expect(
      (shorter.normalizedDraft.patient as { addresses: unknown[] }).addresses,
    ).toHaveLength(1)
    expect(shorter.validation.errors).toContainEqual(
      expect.objectContaining({ code: "missing-record" }),
    )
  })
})
