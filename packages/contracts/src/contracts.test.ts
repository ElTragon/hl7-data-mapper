import { describe, expect, it } from "vitest"
import { z } from "zod"

import normalizedOutputFixture from "../../../fixtures/expected/oml-o21-basic.normalized.json"

import {
  buildSourcePath,
  createSourceReference,
  createValidationSummary,
  hasBlockingValidationErrors,
  Hl7ItemSetSchema,
  NormalizedFieldSchema,
  NormalizedOutputSchema,
  SourceReferenceSchema,
} from "./index.js"

describe("source references", () => {
  it("builds a source path from structured HL7 positions", () => {
    expect(buildSourcePath({ segment: "PID", field: 5, component: 1 })).toBe(
      "PID-5.1",
    )
  })

  it("creates a source reference with a derived path", () => {
    expect(
      createSourceReference({
        segment: "OBR",
        field: 4,
        component: 1,
        segmentIndex: 7,
        raw: "57021-8^CBC W Auto Differential panel^LN",
      }),
    ).toEqual({
      path: "OBR-4.1",
      segment: "OBR",
      field: 4,
      component: 1,
      segmentIndex: 7,
      raw: "57021-8^CBC W Auto Differential panel^LN",
    })
  })

  it("rejects malformed source paths", () => {
    expect(() =>
      SourceReferenceSchema.parse({
        path: "PATIENT-5",
        segment: "PATIENT",
        field: 5,
      }),
    ).toThrow()
  })
})

describe("hl7Item contracts", () => {
  it("validates a client-specific multi-step mapping set", () => {
    const itemSet = Hl7ItemSetSchema.parse({
      clientId: "northstar-lab",
      messageType: "OML^O21",
      hl7Version: "2.5.1",
      items: [
        {
          id: "patient-name-raw",
          clientId: "northstar-lab",
          sequence: 1,
          section: "patient",
          targetPath: "patient.name",
          label: "Patient name",
          action: "extract",
          valueType: "person_name",
          sources: [
            createSourceReference({
              segment: "PID",
              field: 5,
              segmentIndex: 1,
            }),
          ],
        },
        {
          id: "patient-family-name",
          clientId: "northstar-lab",
          sequence: 2,
          section: "patient",
          targetPath: "patient.name.family",
          label: "Patient family name",
          action: "split",
          valueType: "string",
          dependsOn: ["patient-name-raw"],
          transform: {
            name: "selectComponent",
            description: "Select the first XPN component as family name.",
            params: { component: 1 },
          },
        },
      ],
    })

    expect(itemSet.items).toHaveLength(2)
  })

  it("rejects duplicate hl7Item ids", () => {
    expect(() =>
      Hl7ItemSetSchema.parse({
        clientId: "northstar-lab",
        messageType: "OML^O21",
        hl7Version: "2.5.1",
        items: [
          {
            id: "patient-id",
            clientId: "northstar-lab",
            sequence: 1,
            section: "patient",
            targetPath: "patient.identifiers[0].value",
            label: "Patient identifier",
            action: "extract",
            sources: [
              createSourceReference({
                segment: "PID",
                field: 3,
              }),
            ],
          },
          {
            id: "patient-id",
            clientId: "northstar-lab",
            sequence: 2,
            section: "patient",
            targetPath: "patient.identifiers[0].type",
            label: "Patient identifier type",
            action: "extract",
            sources: [
              createSourceReference({
                segment: "PID",
                field: 3,
                component: 5,
              }),
            ],
          },
        ],
      }),
    ).toThrow()
  })
})

describe("normalized field contracts", () => {
  it("wraps a normalized value with review and provenance defaults", () => {
    const PatientFamilyNameFieldSchema = NormalizedFieldSchema(z.string())

    const field = PatientFamilyNameFieldSchema.parse({
      key: "patient.name.family",
      label: "Patient family name",
      value: "Lopez",
      sources: [
        createSourceReference({
          segment: "PID",
          field: 5,
          component: 1,
        }),
      ],
    })

    expect(field.reviewStatus).toBe("unreviewed")
    expect(field.transformHistory).toEqual([])
  })
})

describe("validation contracts", () => {
  it("groups validation issues by severity", () => {
    const summary = createValidationSummary([
      {
        code: "missing-patient",
        severity: "error",
        message: "PID segment is required.",
        segment: "PID",
      },
      {
        code: "missing-specimen",
        severity: "warning",
        message: "SPM segment is recommended.",
        segment: "SPM",
      },
    ])

    expect(summary.errors).toHaveLength(1)
    expect(summary.warnings).toHaveLength(1)
    expect(hasBlockingValidationErrors(summary)).toBe(true)
  })
})

describe("normalized output contracts", () => {
  it("validates the canonical OML O21 normalized fixture", () => {
    expect(() =>
      NormalizedOutputSchema.parse(normalizedOutputFixture),
    ).not.toThrow()
  })
})
