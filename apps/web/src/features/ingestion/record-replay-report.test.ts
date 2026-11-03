import { createSourceReference } from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { defaultOmlO21ClientProfile } from "@hl7-data-mapper/mapping-engine"
import { buildReportPackage } from "@hl7-data-mapper/report-generator"
import { expect, it } from "vitest"
import { buildReviewWorkspaceSnapshot } from "./demo-storage"
import {
  applySourceCorrection,
  createReviewWorkflow,
  updateReviewedField,
  type ReviewWorkflowState,
} from "./ingestion-workflow"
import {
  buildReportHl7Items,
  buildReportReviewDecisions,
  composeCurrentNormalizedOutput,
} from "./review-report"

const occurredAt = "2026-10-29T00:00:00Z"
const raw = [
  "MSH|^~\\&|A|B|C|D|20260706101500-0700||OML^O21^OML_O21|1|P|2.5.1",
  "PID|1||MRN^^^LAB^MR||Doe^Jane||19870514|F|||~Second^^Two^NY^10001",
  "ORC|NW|ORDER",
  "OBR|1|ORDER||CBC^CBC^LN",
  "SPM|1||S|BLD",
].join("\r")
const populated = raw.replace("|||~Second", "|||First^^One^CA^90001~Second")

function reload(state: ReviewWorkflowState, message: string) {
  const snapshot = buildReviewWorkspaceSnapshot({
    previousSnapshot: null,
    profile: state.profile,
    reviewFields: state.reviewFields,
    messageFingerprint: state.messageFingerprint,
    updatedAt: occurredAt,
  })
  return createReviewWorkflow({
    parsedMessage: parseHl7Message(message),
    sourceProfile: defaultOmlO21ClientProfile,
    storedSnapshot: JSON.parse(JSON.stringify(snapshot)),
    occurredAt,
  })
}
function correct(
  state: ReviewWorkflowState,
  index: number,
  repetition: number,
  component = 4,
) {
  return applySourceCorrection({
    state,
    field: state.reviewFields.find(
      (field) =>
        field.section !== "exceptions" &&
        field.normalizedPath === `patient.addresses[${index}].city`,
    )!,
    source: createSourceReference({
      segment: "PID",
      field: 11,
      repetition,
      component,
    }),
    occurredAt,
  })
}
function replay() {
  const state = createReviewWorkflow({
    parsedMessage: parseHl7Message(raw),
    sourceProfile: defaultOmlO21ClientProfile,
    storedSnapshot: null,
    occurredAt,
  })
  return reload(correct(state, 0, 2), populated)
}

it("retains a re-edited correction's confirmation and history when its sibling is corrected", async () => {
  let state = correct(replay(), 1, 2, 5)
  const field = state.reviewFields.find(
    (field) => field.normalizedPath === "patient.addresses[1].city",
  )!
  state = updateReviewedField(state, { ...field, reviewStatus: "confirmed" })
  const expected = {
    id: field.id,
    hl7ItemId: field.hl7ItemId,
    normalizedPath: field.normalizedPath,
    value: "10001",
    reviewStatus: "confirmed",
    appliedCorrection: {
      targetHl7ItemId: field.appliedCorrection!.targetHl7ItemId,
      replacementSource: { path: "PID-11[2].5" },
    },
  }
  expect(field.appliedCorrection).toBeTruthy()
  state = correct(state, 0, 1)
  for (const current of [state, reload(state, populated)]) {
    expect(
      current.reviewFields.find(
        (candidate) => candidate.normalizedPath === field.normalizedPath,
      ),
    ).toMatchObject(expected)
    expect(new Set(current.reviewFields.map((field) => field.id)).size).toBe(
      current.reviewFields.length,
    )
    expect((await completedReport(current)).manifest.review.status).toBe(
      "completed",
    )
  }
  // Earlier versions could save the same correction under the bare item ID
  // after its sibling was corrected and the collision disappeared.
  const legacy = {
    ...state,
    reviewFields: state.reviewFields.map((candidate) =>
      candidate.id === field.id
        ? { ...candidate, id: field.hl7ItemId! }
        : candidate,
    ),
  }
  const migrated = reload(legacy, populated)
  expect(
    migrated.reviewFields.find((candidate) => candidate.id === field.id),
  ).toMatchObject(expected)
  expect((await completedReport(migrated)).manifest.review.status).toBe(
    "completed",
  )
  const parentId = state.profile.itemSet.items.find(
    (item) => item.id === field.hl7ItemId,
  )!.dependsOn[0]!
  const siblingDecision = reload(
    {
      ...legacy,
      reviewFields: legacy.reviewFields.map((candidate) =>
        candidate.id === field.hl7ItemId
          ? {
              ...candidate,
              normalizedPath: "patient.addresses[0].city",
              appliedCorrection: {
                ...candidate.appliedCorrection!,
                targetHl7ItemId: parentId,
              },
            }
          : candidate,
      ),
    },
    populated,
  )
  expect(
    siblingDecision.reviewFields.find((candidate) => candidate.id === field.id),
  ).toMatchObject({
    reviewStatus: "unreviewed",
    appliedCorrection: null,
  })
})

async function completedReport(state: ReviewWorkflowState) {
  return buildReportPackage(
    {
      requestedReviewStatus: "completed",
      appVersion: "0.1.0",
      generatedAt: occurredAt,
      clientId: state.profile.clientId,
      profileId: state.profile.profileId,
      profileVersion: state.profile.profileVersion,
      messageHash: "a".repeat(64),
      normalizedData: composeCurrentNormalizedOutput(state),
      hl7Items: buildReportHl7Items(state.profile, state.mappingResult),
      reviewDecisions: buildReportReviewDecisions(
        state.reviewFields.map((field) => ({
          ...field,
          reviewStatus: "confirmed",
        })),
        occurredAt,
      ),
      validationResults: state.mappingResult.validation,
    },
    () => "a".repeat(64),
  )
}

it("exports completed review with resolved paths without rewriting the saved profile", async () => {
  const state = replay()
  const saved = JSON.stringify(state.profile)
  expect(state.mappingResult.validation.errors).toEqual([])
  const report = await completedReport(state)
  expect(report.manifest.review).toMatchObject({
    status: "completed",
    unresolvedCount: 0,
    totalCount: state.reviewFields.length,
  })
  const items = JSON.parse(
    report.files.find((file) => file.fileName === "hl7-items.json")!.content,
  )
  const correction = state.profile.itemSet.items.find(
    (item) => item.recordCorrectionIdentity,
  )!
  expect(correction.targetPath).toBe("patient.addresses[0].city")
  expect(
    items.find((item: { id: string }) => item.id === correction.id),
  ).toMatchObject({
    targetPath: "patient.addresses[1].city",
    label: "Patient addresses: Record 2 · City",
  })
  expect(JSON.stringify(state.profile)).toBe(saved)
})

it("refreshes stale labels from older re-edited drafts in review and completed export", async () => {
  const state = replay()
  // Before labels followed relocation, re-editing saved the new target path
  // alongside the original record label. Reproduce that persisted draft.
  const legacy = correct(
    {
      ...state,
      reviewFields: state.reviewFields.map((field) =>
        field.normalizedPath === "patient.addresses[1].city"
          ? { ...field, label: "Patient addresses: Record 1 · City" }
          : field,
      ),
    },
    1,
    2,
    5,
  )
  const correction = legacy.profile.itemSet.items.find(
    (item) => item.recordCorrectionIdentity,
  )!
  expect(correction).toMatchObject({
    targetPath: "patient.addresses[1].city",
    label: "Patient addresses: Record 1 · City",
  })
  const restored = reload(legacy, populated)
  const saved = JSON.stringify(restored.profile)
  expect(new Set(restored.reviewFields.map((field) => field.id)).size).toBe(
    restored.reviewFields.length,
  )
  expect(
    restored.reviewFields.find((field) => field.hl7ItemId === correction.id),
  ).toMatchObject({
    reviewStatus: "mapping_changed",
    appliedCorrection: { targetHl7ItemId: correction.id },
  })
  expect(
    restored.reviewFields
      .filter((field) =>
        /^patient\.addresses\[\d+\]\.city$/.test(field.normalizedPath),
      )
      .map((field) => [field.normalizedPath, field.label, field.value]),
  ).toEqual([
    ["patient.addresses[0].city", "Patient addresses: Record 1 · City", "One"],
    [
      "patient.addresses[1].city",
      "Patient addresses: Record 2 · City",
      "10001",
    ],
  ])
  const report = await completedReport(restored)
  expect(report.manifest.review.status).toBe("completed")
  const items = JSON.parse(
    report.files.find((file) => file.fileName === "hl7-items.json")!.content,
  )
  expect(
    items.find((item: { id: string }) => item.id === correction.id),
  ).toMatchObject({
    targetPath: correction.targetPath,
    sources: JSON.parse(JSON.stringify(correction.sources)),
    label: "Patient addresses: Record 2 · City",
  })
  expect(JSON.stringify(restored.profile)).toBe(saved)
})

it("preserves both corrections, their review state, and completed export after relocation and reload", async () => {
  const state = replay()
  const original = state.profile.itemSet.items.find(
    (item) => item.recordCorrectionIdentity,
  )!
  const corrected = correct(state, 0, 1)
  expect(
    corrected.profile.itemSet.items.filter(
      (item) => item.recordCorrectionIdentity,
    ),
  ).toHaveLength(2)
  expect(
    corrected.profile.itemSet.items.find((item) => item.id === original.id),
  ).toEqual(original)
  const firstField = corrected.reviewFields.find(
    (field) => field.id === corrected.selectedFieldId,
  )!
  expect(firstField).toMatchObject({
    normalizedPath: "patient.addresses[0].city",
    reviewStatus: "mapping_changed",
    appliedCorrection: { targetHl7ItemId: firstField.hl7ItemId },
  })
  const restored = reload(corrected, populated)
  expect(
    restored.reviewFields.find(
      (field) => field.normalizedPath === "patient.addresses[1].city",
    )?.label,
  ).toBe("Patient addresses: Record 2 · City")
  expect(
    composeCurrentNormalizedOutput(restored).patient.addresses.map(
      (address) => address.city,
    ),
  ).toEqual(["CA", "NY"])
  expect(
    restored.reviewFields.find((field) => field.id === firstField.id)
      ?.appliedCorrection,
  ).toMatchObject({
    targetHl7ItemId: firstField.hl7ItemId,
    replacementSource: { path: "PID-11[1].4" },
    notes: null,
  })
  expect(restored.mappingResult.validation.errors).toEqual([])
  expect(new Set(restored.reviewFields.map((field) => field.id)).size).toBe(
    restored.reviewFields.length,
  )
  expect((await completedReport(restored)).manifest.review.status).toBe(
    "completed",
  )
  // Editing the relocated correction must keep its stable ID and its sibling.
  const edited = correct(restored, 1, 2, 5)
  expect(
    edited.profile.itemSet.items.find((item) => item.id === original.id)?.label,
  ).toBe("Patient addresses: Record 2 · City")
  expect(
    edited.profile.itemSet.items.filter(
      (item) => item.recordCorrectionIdentity,
    ),
  ).toHaveLength(2)
  expect(
    edited.profile.itemSet.items.find((item) => item.id === original.id)
      ?.sources[0]?.component,
  ).toBe(5)
  expect(
    composeCurrentNormalizedOutput(edited).patient.addresses.map(
      (address) => address.city,
    ),
  ).toEqual(["CA", "10001"])
})
