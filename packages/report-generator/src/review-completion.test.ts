import { describe, expect, it } from "vitest"
import { buildReportPackage } from "./index.js"
import {
  createReportInput,
  fakeHash,
  sampleReviewDecision,
  sampleHl7Item,
  findReportFile,
} from "./report-fixtures.test-support.js"

describe("report review completion", () => {
  it("accepts a replayed decision only for the matching resolved mapping and source", async () => {
    const replayed = {
      ...sampleReviewDecision,
      fieldId: `${sampleHl7Item.id}:replayed:${sampleHl7Item.targetPath}`,
    }
    const input = createReportInput({
      requestedReviewStatus: "completed",
      reviewDecisions: [replayed],
    })
    expect(
      (await buildReportPackage(input, () => fakeHash)).manifest.review.status,
    ).toBe("completed")
    for (const changed of [
      { normalizedPath: "patient.addresses[1].city" },
      { hl7ItemId: "another-item" },
      { sourcePath: "PID-99" },
    ]) {
      await expect(
        buildReportPackage(
          { ...input, reviewDecisions: [{ ...replayed, ...changed }] },
          () => fakeHash,
        ),
      ).rejects.toThrow("Complete all required")
    }
  })
  it("derives completed and interim status from decisions", async () => {
    for (const status of [
      "confirmed",
      "mapping_changed",
      "incorrect",
      "unreviewed",
    ] as const) {
      const report = await buildReportPackage(
        createReportInput({
          reviewDecisions: [{ ...sampleReviewDecision, reviewStatus: status }],
        }),
        () => fakeHash,
      )
      expect(report.manifest.review.status).toBe(
        status === "confirmed" ? "completed" : "interim",
      )
      expect(findReportFile(report, "REPORT.md").content).toContain(
        report.manifest.review.status,
      )
    }
  })
  it("rejects a requested completed report with missing or mismatched decisions", async () => {
    for (const reviewDecisions of [
      [],
      [{ ...sampleReviewDecision, normalizedPath: "patient.other" }],
    ]) {
      await expect(
        buildReportPackage(
          createReportInput({
            requestedReviewStatus: "completed",
            reviewDecisions,
          }),
          () => fakeHash,
        ),
      ).rejects.toThrow("Complete all required")
    }
  })
  it.each(["PID-3.1", null, undefined])(
    "does not count a confirmation for source %s against the current source",
    async (sourcePath) => {
      const input = createReportInput({
        reviewDecisions: [{ ...sampleReviewDecision, sourcePath }],
      })
      const interim = await buildReportPackage(input, () => fakeHash)
      expect(interim.manifest.review).toMatchObject({
        status: "interim",
        resolvedCount: 0,
        unresolvedCount: 1,
      })
      await expect(
        buildReportPackage(
          { ...input, requestedReviewStatus: "completed" },
          () => fakeHash,
        ),
      ).rejects.toThrow("Complete all required")
    },
  )

  it("requires all source references for a mapping with multiple sources", async () => {
    const secondary = {
      path: "PID-5.2",
      segment: "PID",
      field: 5,
      component: 2,
    }
    const input = createReportInput({
      hl7Items: [
        { ...sampleHl7Item, sources: [...sampleHl7Item.sources, secondary] },
      ],
      requestedReviewStatus: "completed",
    })
    await expect(buildReportPackage(input, () => fakeHash)).rejects.toThrow(
      "Complete all required",
    )
    const currentSources = input.hl7Items[0]!.sources
    expect(
      (
        await buildReportPackage(
          {
            ...input,
            reviewDecisions: [
              { ...sampleReviewDecision, sourceReferences: currentSources },
            ],
          },
          () => fakeHash,
        )
      ).manifest.review.status,
    ).toBe("completed")
    await expect(
      buildReportPackage(
        {
          ...input,
          reviewDecisions: [
            { ...sampleReviewDecision, sourcePath: secondary.path },
          ],
        },
        () => fakeHash,
      ),
    ).rejects.toThrow("Complete all required")
  })

  it("invalidates a reviewed join when its separator changes", async () => {
    const secondSource = {
      path: "PID-5.2",
      segment: "PID",
      field: 5,
      component: 2,
    }
    const currentSources = [...sampleHl7Item.sources, secondSource]
    const input = createReportInput({
      hl7Items: [
        {
          ...sampleHl7Item,
          action: "join",
          sources: currentSources,
          joinSeparator: " / ",
        },
      ],
      reviewDecisions: [
        {
          ...sampleReviewDecision,
          sourceReferences: currentSources,
          joinSeparator: " / ",
        },
      ],
      requestedReviewStatus: "completed",
    })

    expect(
      (await buildReportPackage(input, () => fakeHash)).manifest.review.status,
    ).toBe("completed")
    for (const joinSeparator of ["-", undefined]) {
      await expect(
        buildReportPackage(
          {
            ...input,
            reviewDecisions: [{ ...input.reviewDecisions[0]!, joinSeparator }],
          },
          () => fakeHash,
        ),
      ).rejects.toThrow("Complete all required")
    }
  })

  it("requires full identity for a row-pinned or split source", async () => {
    const pinnedSplitSource = {
      ...sampleHl7Item.sources[0]!,
      segmentIndex: 1,
      literalSplit: { separator: "-", partNumber: 2 },
    }
    const input = createReportInput({
      hl7Items: [{ ...sampleHl7Item, sources: [pinnedSplitSource] }],
      requestedReviewStatus: "completed",
    })

    await expect(buildReportPackage(input, () => fakeHash)).rejects.toThrow(
      "Complete all required",
    )
    expect(
      (
        await buildReportPackage(
          {
            ...input,
            reviewDecisions: [
              {
                ...sampleReviewDecision,
                sourceReferences: [pinnedSplitSource],
              },
            ],
          },
          () => fakeHash,
        )
      ).manifest.review.status,
    ).toBe("completed")
  })

  it("rejects a confirmation when any source coordinate or split rule changes", async () => {
    const primarySource = {
      ...sampleHl7Item.sources[0]!,
      segmentIndex: 1,
      literalSplit: { separator: "-", partNumber: 1 },
    }
    const secondarySource = {
      path: "PID-5.2",
      segment: "PID",
      field: 5,
      component: 2,
      segmentIndex: 1,
    }
    const currentSources = [primarySource, secondarySource]
    const reportInput = createReportInput({
      hl7Items: [{ ...sampleHl7Item, sources: currentSources }],
      reviewDecisions: [
        { ...sampleReviewDecision, sourceReferences: currentSources },
      ],
      requestedReviewStatus: "completed",
    })

    expect(
      (await buildReportPackage(reportInput, () => fakeHash)).manifest.review
        .status,
    ).toBe("completed")

    const staleSourceSets = [
      [{ ...primarySource, segmentIndex: 2 }, secondarySource],
      [
        {
          ...primarySource,
          literalSplit: { separator: "-", partNumber: 2 },
        },
        secondarySource,
      ],
      [primarySource, { ...secondarySource, field: 7, path: "PID-7" }],
    ]

    for (const staleSources of staleSourceSets) {
      await expect(
        buildReportPackage(
          {
            ...reportInput,
            reviewDecisions: [
              { ...sampleReviewDecision, sourceReferences: staleSources },
            ],
          },
          () => fakeHash,
        ),
      ).rejects.toThrow("Complete all required")
    }
  })

  it.each([null, undefined])(
    "accepts source-less mappings with source %s",
    async (sourcePath) => {
      const input = createReportInput({
        hl7Items: [{ ...sampleHl7Item, sources: [] }],
        reviewDecisions: [{ ...sampleReviewDecision, sourcePath }],
        requestedReviewStatus: "completed",
      })
      expect(
        (await buildReportPackage(input, () => fakeHash)).manifest.review
          .status,
      ).toBe("completed")
      await expect(
        buildReportPackage(
          { ...input, reviewDecisions: [sampleReviewDecision] },
          () => fakeHash,
        ),
      ).rejects.toThrow("Complete all required")
    },
  )

  it("requires a warning acknowledgment to match its source", async () => {
    const issue = {
      id: "missing-source",
      origin: "source_read" as const,
      code: "source-read-empty",
      severity: "warning" as const,
      message: "Check source",
      fieldKey: sampleHl7Item.targetPath,
      source: sampleHl7Item.sources[0],
    }
    const acknowledgment = {
      ...sampleReviewDecision,
      fieldId: `issue:${issue.id}`,
    }
    const input = createReportInput({
      requestedReviewStatus: "completed",
      validationResults: { errors: [], warnings: [issue], info: [] },
      reviewDecisions: [sampleReviewDecision, acknowledgment],
    })
    expect(
      (await buildReportPackage(input, () => fakeHash)).manifest.review.status,
    ).toBe("completed")
    await expect(
      buildReportPackage(
        {
          ...input,
          reviewDecisions: [
            sampleReviewDecision,
            { ...acknowledgment, sourcePath: "PID-3.1" },
          ],
        },
        () => fakeHash,
      ),
    ).rejects.toThrow("Complete all required")
  })

  it("retains parser warnings after acknowledgment and requires acknowledgment for completion", async () => {
    const issue = {
      id: "parser-warning-1",
      origin: "parser" as const,
      code: "parser-warning",
      severity: "warning" as const,
      message: "Check the message header.",
    }
    const input = createReportInput({
      validationResults: { errors: [], warnings: [issue], info: [] },
    })
    expect(
      (await buildReportPackage(input, () => fakeHash)).manifest.review.status,
    ).toBe("interim")
    const report = await buildReportPackage(
      {
        ...input,
        requestedReviewStatus: "completed",
        reviewDecisions: [
          ...input.reviewDecisions,
          {
            ...sampleReviewDecision,
            fieldId: `issue:${issue.id}`,
            normalizedPath: `validation.${issue.id}`,
            hl7ItemId: null,
            sourcePath: null,
          },
        ],
      },
      () => fakeHash,
    )
    expect(report.manifest.review).toMatchObject({
      status: "completed",
      warningCount: 1,
    })
    expect(findReportFile(report, "validation-results.json").content).toContain(
      issue.message,
    )
    expect(findReportFile(report, "REPORT.md").content).toContain(issue.message)
  })
  it("blocks parser errors even for interim exports", async () => {
    await expect(
      buildReportPackage(
        createReportInput({
          validationResults: {
            errors: [
              {
                origin: "parser",
                severity: "error",
                code: "invalid",
                message: "Invalid message",
              },
            ],
            warnings: [],
            info: [],
          },
        }),
        () => fakeHash,
      ),
    ).rejects.toThrow("Parser errors")
  })
})
