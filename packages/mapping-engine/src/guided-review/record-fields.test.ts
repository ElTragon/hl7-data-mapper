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

const parsedMessage = parseHl7Message(
  [
    "MSH|^~\\&|A|B|C|D|20260706101500-0700||OML^O21^OML_O21|1|P|2.5.1",
    "PID|1||MRN^^^LAB^MR||Doe^Jane||19870514|F|||First^^One^CA^90001~Second^^Two^NY^10001",
    "IN1|1|A^Plan A|INS-A|Insurer A",
    "IN1|2|B^Plan B|INS-B|Insurer B",
    "ORC|NW|ORDER-A",
    "OBR|1|ORDER-A||A^Test A^LN",
    "SPM|1||A|BLD",
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
