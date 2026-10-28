import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import {
  buildReviewableFields,
  defaultOmlO21ClientProfile,
  executeMapping,
} from "@hl7-data-mapper/mapping-engine"
import { describe, expect, it } from "vitest"
import { buildReportPackage } from "@hl7-data-mapper/report-generator"
import {
  ClientProfileSchema,
  createSourceReference,
} from "@hl7-data-mapper/contracts"
import { buildReviewWorkspaceSnapshot } from "./demo-storage"
import {
  createReviewWorkflow,
  applySourceCorrection,
} from "./ingestion-workflow"

import sampleHl7Message from "../../../../../fixtures/valid/oml-o21-basic.hl7?raw"
import {
  buildReportReviewDecisions,
  composeCurrentNormalizedOutput,
} from "./review-report"

describe("review report", () => {
  it.each([
    ["labOrders[0].orderingProvider", false],
    ["labOrders[0].orderingProvider", true],
    ["labOrders[0].timing.priority", false],
    ["labOrders[0].specimens", false],
    ["labOrders[0].specimens[0].sequence", false],
  ] as const)(
    "rejects an old saved correction to %s (provider absent: %s) without losing valid mappings",
    async (targetPath, absentProvider) => {
      const generatedAt = "2026-10-28T00:00:00Z"
      const parsedMessage = parseHl7Message(
        absentProvider
          ? sampleHl7Message.replaceAll("12345^Patel^Anika^^^^MD", "")
          : sampleHl7Message,
      )
      const original = createReviewWorkflow({
        parsedMessage,
        sourceProfile: defaultOmlO21ClientProfile,
        storedSnapshot: null,
        occurredAt: generatedAt,
      })
      const parent = original.profile.itemSet.items.find(
        (item) => item.id === "lab-order-groups",
      )!
      const sequence =
        Math.max(
          ...original.profile.itemSet.items.map((item) => item.sequence),
        ) + 1
      const savedCorrection = {
        ...parent,
        id: `${parent.id}:${targetPath}`,
        targetPath,
        sequence,
        dependsOn: [parent.id],
        sources: [
          createSourceReference({ segment: "PID", field: 5, component: 2 }),
        ],
        sourceExpectations: [],
        action: "extract",
        valueType: "string",
        transform: null,
        required: false,
      }
      const profile = ClientProfileSchema.parse({
        ...original.profile,
        itemSet: {
          ...original.profile.itemSet,
          items: [
            ...original.profile.itemSet.items,
            savedCorrection,
            {
              ...savedCorrection,
              id: `${parent.id}:labOrders[0].status`,
              targetPath: "labOrders[0].status",
              sequence: sequence + 1,
            },
          ],
        },
      })
      const snapshot = buildReviewWorkspaceSnapshot({
        previousSnapshot: null,
        profile,
        reviewFields: original.reviewFields,
        messageFingerprint: original.messageFingerprint,
        updatedAt: generatedAt,
      })
      const storedSnapshot = JSON.parse(
        JSON.stringify({
          ...snapshot,
          reviewContext: {
            ...snapshot.reviewContext,
            engineRevision: "review-v3",
          },
        }),
      )
      const restored = createReviewWorkflow({
        parsedMessage,
        sourceProfile: defaultOmlO21ClientProfile,
        storedSnapshot,
        occurredAt: generatedAt,
      })
      expect(restored.profile).toEqual(profile)
      expect(restored.mappingResult.validation.errors).toContainEqual(
        expect.objectContaining({
          code: "invalid-record-correction",
          fieldKey: targetPath,
        }),
      )
      const normalizedData = composeCurrentNormalizedOutput(restored)
      const originalData = composeCurrentNormalizedOutput(original)
      if (absentProvider)
        expect(originalData.labOrders[0]?.orderingProvider).toBeNull()
      expect(normalizedData.labOrders).toEqual(
        originalData.labOrders.map((order, index) =>
          index === 0
            ? { ...order, status: originalData.patient.name.given }
            : order,
        ),
      )
      const hash = "a".repeat(64)
      const input = {
        appVersion: "0.1.0",
        generatedAt,
        clientId: profile.clientId,
        profileId: profile.profileId,
        profileVersion: profile.profileVersion,
        messageHash: hash,
        normalizedData,
        hl7Items: profile.itemSet.items,
        reviewDecisions: buildReportReviewDecisions(
          restored.reviewFields.map((field) => ({
            ...field,
            reviewStatus: "confirmed",
          })),
          generatedAt,
        ),
        validationResults: restored.mappingResult.validation,
      }
      expect(
        (await buildReportPackage(input, () => hash)).manifest.review.status,
      ).toBe("interim")
      await expect(
        buildReportPackage(
          { ...input, requestedReviewStatus: "completed" },
          () => hash,
        ),
      ).rejects.toThrow("Complete all required")
    },
  )
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

it("exports a completed report from current browser review decisions", async () => {
  const parsedMessage = parseHl7Message(sampleHl7Message)
  const profile = defaultOmlO21ClientProfile
  const mappingResult = executeMapping({ parsedMessage, profile })
  const fields = buildReviewableFields({ mappingResult, profile }).map(
    (field) => ({ ...field, reviewStatus: "confirmed" as const }),
  )
  const generatedAt = "2026-08-19T12:00:00.000Z"
  const hash = "a".repeat(64)
  const report = await buildReportPackage(
    {
      requestedReviewStatus: "completed",
      appVersion: "0.1.0",
      generatedAt,
      clientId: profile.clientId,
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
      messageHash: hash,
      normalizedData: composeCurrentNormalizedOutput({
        parsedMessage,
        mappingResult,
      }),
      hl7Items: profile.itemSet.items,
      reviewDecisions: buildReportReviewDecisions(fields, generatedAt),
      validationResults: mappingResult.validation,
    },
    () => hash,
  )
  expect(report.manifest.review).toMatchObject({
    status: "completed",
    unresolvedCount: 0,
    totalCount: fields.length,
  })
})

it("exports a completed report after correcting a timestamp while preserving absent objects", async () => {
  const generatedAt = "2026-10-28T00:00:00Z"
  const parsedMessage = parseHl7Message(
    [
      "MSH|^~\\&|A|B|C|D|20260706101500-0700||OML^O21^OML_O21|1|P|2.5.1",
      "PID|1||MRN^^^LAB^MR||Doe^Jane||19870514|F",
      "ORC|NW|ORDER|||||||20260230100000",
      "OBR|1|ORDER||CBC^CBC^LN",
      "SPM|1||S|BLD",
    ].join("\r"),
  )
  const state = createReviewWorkflow({
    parsedMessage,
    sourceProfile: defaultOmlO21ClientProfile,
    storedSnapshot: null,
    occurredAt: generatedAt,
  })
  const provider = state.reviewFields.find(
    (field) => field.normalizedPath === "labOrders[0].orderingProvider",
  )!
  expect(
    applySourceCorrection({
      state,
      field: provider,
      source: createSourceReference({ segment: "PID", field: 5, component: 2 }),
      occurredAt: generatedAt,
    }),
  ).toBe(state)
  const corrected = applySourceCorrection({
    state,
    field: state.reviewFields.find(
      (field) => field.normalizedPath === "labOrders[0].transactionAt",
    )!,
    source: createSourceReference({ segment: "MSH", field: 7, component: 1 }),
    occurredAt: generatedAt,
  })
  expect(corrected.mappingResult.validation.errors).toEqual([])
  const normalizedData = composeCurrentNormalizedOutput(corrected)
  expect(normalizedData.labOrders[0]).toMatchObject({
    transactionAt: "2026-07-06T10:15:00-07:00",
    orderingProvider: null,
  })
  const hash = "a".repeat(64)
  const report = await buildReportPackage(
    {
      requestedReviewStatus: "completed",
      appVersion: "0.1.0",
      generatedAt,
      clientId: corrected.profile.clientId,
      profileId: corrected.profile.profileId,
      profileVersion: corrected.profile.profileVersion,
      messageHash: hash,
      normalizedData,
      hl7Items: corrected.profile.itemSet.items,
      reviewDecisions: buildReportReviewDecisions(
        corrected.reviewFields.map((field) => ({
          ...field,
          reviewStatus: "confirmed",
        })),
        generatedAt,
      ),
      validationResults: corrected.mappingResult.validation,
    },
    () => hash,
  )
  expect(report.manifest.review).toMatchObject({
    status: "completed",
    unresolvedCount: 0,
    totalCount: corrected.reviewFields.length,
  })
})
