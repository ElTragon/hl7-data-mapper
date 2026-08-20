import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import {
  buildReviewableFields,
  defaultOmlO21ClientProfile,
  executeMapping,
} from "@hl7-data-mapper/mapping-engine"
import { describe, expect, it } from "vitest"

import sampleHl7Message from "../../../../../fixtures/valid/oml-o21-basic.hl7?raw"
import {
  buildReportReviewDecisions,
  composeCurrentNormalizedOutput,
} from "./review-report"

describe("review report", () => {
  it("uses the supplied timestamp for every review decision", () => {
    const parsedMessage = parseHl7Message(sampleHl7Message)
    const mappingResult = executeMapping({
      parsedMessage,
      profile: defaultOmlO21ClientProfile,
    })
    const reviewFields = buildReviewableFields({
      mappingResult,
      profile: defaultOmlO21ClientProfile,
    })
    const updatedAt = "2026-08-19T12:00:00.000Z"

    expect(
      buildReportReviewDecisions(reviewFields, updatedAt).every(
        (decision) => decision.updatedAt === updatedAt,
      ),
    ).toBe(true)
  })

  it("overlays current mapped values without losing normalized metadata", () => {
    const parsedMessage = parseHl7Message(sampleHl7Message)
    const mappingResult = executeMapping({
      parsedMessage,
      profile: defaultOmlO21ClientProfile,
    })
    const normalizedOutput = composeCurrentNormalizedOutput({
      parsedMessage,
      mappingResult: {
        ...mappingResult,
        normalizedDraft: {
          ...mappingResult.normalizedDraft,
          patient: {
            ...(mappingResult.normalizedDraft.patient as Record<
              string,
              unknown
            >),
            name: {
              family: "Rivera",
              given: "Sofia",
              middle: null,
              suffix: null,
              prefix: null,
            },
          },
        },
      },
    })

    expect(normalizedOutput.schemaVersion).toBe("1.0.0")
    expect(normalizedOutput.message.controlId).toBeTruthy()
    expect(normalizedOutput.patient.name).toMatchObject({
      family: "Rivera",
      given: "Sofia",
    })
  })
})
