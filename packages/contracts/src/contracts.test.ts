import { describe, expect, it } from "vitest"
import { z } from "zod"

import normalizedOutputFixture from "../../../fixtures/expected/oml-o21-basic.normalized.json"

import {
  buildSourcePath,
  archivePublishedClientProfile,
  canEditClientProfile,
  canExecuteClientProfile,
  ClientProfileSchema,
  createDraftClientProfileVersion,
  createSourceReference,
  createValidationSummary,
  GUIDED_REVIEW_STEPS,
  hasBlockingValidationErrors,
  Hl7ItemSetSchema,
  NormalizedFieldSchema,
  NormalizedOutputSchema,
  AuditEventSchema,
  publishDraftClientProfile,
  isSafeAuditMetadata,
  MappingRunMetadataSchema,
  ReviewableFieldSchema,
  sortHl7ItemsForExecution,
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

  it("rejects dependencies on later items", () => {
    expect(() =>
      Hl7ItemSetSchema.parse({
        clientId: "northstar-lab",
        messageType: "OML^O21",
        hl7Version: "2.5.1",
        items: [
          {
            id: "patient-family-name",
            clientId: "northstar-lab",
            sequence: 1,
            section: "patient",
            targetPath: "patient.name.family",
            label: "Patient family name",
            action: "split",
            dependsOn: ["patient-name-raw"],
          },
          {
            id: "patient-name-raw",
            clientId: "northstar-lab",
            sequence: 2,
            section: "patient",
            targetPath: "patient.name",
            label: "Patient name",
            action: "extract",
            valueType: "person_name",
            sources: [
              createSourceReference({
                segment: "PID",
                field: 5,
              }),
            ],
          },
        ],
      }),
    ).toThrow()
  })

  it("sorts hl7Items by sequence for deterministic execution", () => {
    const itemSet = Hl7ItemSetSchema.parse({
      clientId: "northstar-lab",
      messageType: "OML^O21",
      hl7Version: "2.5.1",
      items: [
        {
          id: "patient-given-name",
          clientId: "northstar-lab",
          sequence: 3,
          section: "patient",
          targetPath: "patient.name.given",
          label: "Patient given name",
          action: "split",
          dependsOn: ["patient-name-raw"],
        },
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
          dependsOn: ["patient-name-raw"],
        },
      ],
    })

    expect(
      sortHl7ItemsForExecution(itemSet.items).map((item) => item.id),
    ).toEqual(["patient-name-raw", "patient-family-name", "patient-given-name"])
  })
})

describe("client profile contracts", () => {
  const draftProfile = {
    clientId: "northstar-lab",
    profileId: "northstar-oml-o21",
    profileVersion: 1,
    status: "draft",
    displayName: "Northstar OML O21 default profile",
    hl7Version: "2.5.1",
    messageType: "OML^O21",
    messageStructure: "OML_O21",
    createdAt: "2026-07-07T11:00:00-07:00",
    updatedAt: "2026-07-07T11:00:00-07:00",
    itemSet: {
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
            }),
          ],
        },
      ],
    },
  } as const

  it("validates a draft client profile", () => {
    const profile = ClientProfileSchema.parse(draftProfile)

    expect(canEditClientProfile(profile)).toBe(true)
    expect(canExecuteClientProfile(profile)).toBe(true)
  })

  it("publishes a draft profile version", () => {
    const profile = publishDraftClientProfile(
      ClientProfileSchema.parse(draftProfile),
      "2026-07-07T12:00:00-07:00",
    )

    expect(profile).toMatchObject({
      status: "published",
      updatedAt: "2026-07-07T12:00:00-07:00",
      publishedAt: "2026-07-07T12:00:00-07:00",
    })
    expect(canEditClientProfile(profile)).toBe(false)
    expect(canExecuteClientProfile(profile)).toBe(true)
  })

  it("requires published profiles to include publishedAt", () => {
    expect(() =>
      ClientProfileSchema.parse({
        ...draftProfile,
        status: "published",
      }),
    ).toThrow()
  })

  it("creates a new draft version from a published profile", () => {
    const publishedProfile = publishDraftClientProfile(
      ClientProfileSchema.parse(draftProfile),
      "2026-07-07T12:00:00-07:00",
    )

    const nextDraft = createDraftClientProfileVersion({
      sourceProfile: publishedProfile,
      nextProfileVersion: 2,
      createdAt: "2026-07-07T13:00:00-07:00",
    })

    expect(nextDraft).toMatchObject({
      profileVersion: 2,
      status: "draft",
      basedOnProfileVersion: 1,
      createdAt: "2026-07-07T13:00:00-07:00",
      updatedAt: "2026-07-07T13:00:00-07:00",
    })
    expect(nextDraft.publishedAt).toBeUndefined()
    expect(nextDraft.archivedAt).toBeUndefined()
    expect(nextDraft.itemSet.items).toEqual(publishedProfile.itemSet.items)
  })

  it("rejects creating a draft version from a draft profile", () => {
    expect(() =>
      createDraftClientProfileVersion({
        sourceProfile: ClientProfileSchema.parse(draftProfile),
        nextProfileVersion: 2,
        createdAt: "2026-07-07T13:00:00-07:00",
      }),
    ).toThrow("Only published profiles")
  })

  it("rejects version numbers that do not move forward", () => {
    const publishedProfile = publishDraftClientProfile(
      ClientProfileSchema.parse(draftProfile),
      "2026-07-07T12:00:00-07:00",
    )

    expect(() =>
      createDraftClientProfileVersion({
        sourceProfile: publishedProfile,
        nextProfileVersion: 1,
        createdAt: "2026-07-07T13:00:00-07:00",
      }),
    ).toThrow("must be greater")
  })

  it("archives a published profile version", () => {
    const publishedProfile = publishDraftClientProfile(
      ClientProfileSchema.parse(draftProfile),
      "2026-07-07T12:00:00-07:00",
    )
    const archivedProfile = archivePublishedClientProfile(
      publishedProfile,
      "2026-07-07T14:00:00-07:00",
    )

    expect(archivedProfile).toMatchObject({
      status: "archived",
      publishedAt: "2026-07-07T12:00:00-07:00",
      archivedAt: "2026-07-07T14:00:00-07:00",
    })
    expect(canEditClientProfile(archivedProfile)).toBe(false)
    expect(canExecuteClientProfile(archivedProfile)).toBe(false)
  })

  it("prevents archived profiles from being executed", () => {
    const profile = ClientProfileSchema.parse({
      ...draftProfile,
      status: "archived",
      publishedAt: "2026-07-07T12:00:00-07:00",
      archivedAt: "2026-07-07T13:00:00-07:00",
    })

    expect(canEditClientProfile(profile)).toBe(false)
    expect(canExecuteClientProfile(profile)).toBe(false)
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

describe("guided review contracts", () => {
  it("defines the guided review walkthrough in order", () => {
    expect(GUIDED_REVIEW_STEPS.map((step) => step.id)).toEqual([
      "patient",
      "sender",
      "coverageGuarantor",
      "labOrders",
      "warnings",
    ])
  })

  it("validates a reviewable field with source evidence and an hl7Item link", () => {
    const source = createSourceReference({
      segment: "PID",
      field: 5,
      component: 1,
      segmentIndex: 1,
      raw: "SYNTHETIC^RILEY",
    })

    const field = ReviewableFieldSchema.parse({
      id: "patient-name-family",
      stepId: "patient",
      section: "patient",
      normalizedPath: "patient.name.family",
      label: "Patient family name",
      value: "SYNTHETIC",
      hl7ItemId: "patient-name-family",
      primarySource: source,
      sources: [source],
      rawSegment: "PID|1||...||SYNTHETIC^RILEY",
      transformHistory: [
        {
          name: "selectComponent",
          description: "Selected XPN component 1.",
        },
      ],
      sourceCandidates: [
        {
          source,
          rawSegment: "PID|1||...||SYNTHETIC^RILEY",
          previewValue: "SYNTHETIC",
          reason: "Default PID patient name source.",
        },
      ],
    })

    expect(field.reviewStatus).toBe("unreviewed")
    expect(field.primarySource?.path).toBe("PID-5.1")
    expect(field.hl7ItemId).toBe("patient-name-family")
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

describe("persistence contracts", () => {
  const messageHash =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

  it("validates safe mapping run metadata without storing message content", () => {
    const metadata = MappingRunMetadataSchema.parse({
      runId: "run-001",
      clientId: "northstar-lab",
      profileId: "northstar-oml-o21",
      profileVersion: 3,
      messageHash,
      messageType: "OML^O21",
      hl7Version: "2.5.1",
      messageStructure: "OML_O21",
      ranAt: "2026-07-08T23:30:00-07:00",
      resultStatus: "completed_with_warnings",
      validationErrorCount: 0,
      validationWarningCount: 2,
      validationInfoCount: 1,
    })

    expect(metadata.profileVersion).toBe(3)
    expect(metadata.messageHash).toBe(messageHash)
  })

  it("rejects mapping run metadata with raw message fields", () => {
    expect(() =>
      MappingRunMetadataSchema.parse({
        runId: "run-001",
        clientId: "northstar-lab",
        profileId: "northstar-oml-o21",
        profileVersion: 3,
        messageHash,
        messageType: "OML^O21",
        hl7Version: "2.5.1",
        messageStructure: "OML_O21",
        ranAt: "2026-07-08T23:30:00-07:00",
        resultStatus: "completed",
        validationErrorCount: 0,
        validationWarningCount: 0,
        validationInfoCount: 0,
        rawMessage: "MSH|^~\\&|...",
      }),
    ).toThrow()
  })

  it("validates safe audit events for mapping runs", () => {
    const event = AuditEventSchema.parse({
      eventId: "audit-001",
      eventType: "mapping_run_completed",
      actorType: "system",
      clientId: "northstar-lab",
      profileId: "northstar-oml-o21",
      profileVersion: 3,
      messageHash,
      metadata: {
        resultStatus: "completed_with_warnings",
        validationErrorCount: 0,
        validationWarningCount: 2,
        reviewedSectionCount: 5,
      },
      createdAt: "2026-07-08T23:31:00-07:00",
    })

    expect(event.metadata).toMatchObject({
      validationWarningCount: 2,
    })
  })

  it("rejects audit metadata that stores raw HL7", () => {
    expect(() =>
      AuditEventSchema.parse({
        eventId: "audit-002",
        eventType: "mapping_run_failed",
        actorType: "system",
        clientId: "northstar-lab",
        profileId: "northstar-oml-o21",
        profileVersion: 3,
        messageHash,
        metadata: {
          rawMessage: "MSH|^~\\&|NORTHSTAR_LIS|NORTHSTAR_LAB",
        },
        createdAt: "2026-07-08T23:31:00-07:00",
      }),
    ).toThrow()
  })

  it("rejects audit metadata that stores patient-like payload keys", () => {
    expect(isSafeAuditMetadata({ patientName: "Elena Lopez" })).toBe(false)
    expect(isSafeAuditMetadata({ validationWarningCount: 2 })).toBe(true)
  })
})

describe("normalized output contracts", () => {
  it("validates the canonical OML O21 normalized fixture", () => {
    expect(() =>
      NormalizedOutputSchema.parse(normalizedOutputFixture),
    ).not.toThrow()
  })
})
