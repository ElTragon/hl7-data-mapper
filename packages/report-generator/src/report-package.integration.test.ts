import {
  Hl7ItemSchema,
  NormalizedOutputSchema,
  REQUIRED_REPORT_FILE_NAMES,
  ReportReviewDecisionSchema,
  ValidationSummarySchema,
} from "@hl7-data-mapper/contracts"
import { describe, expect, it } from "vitest"

import { buildReportPackage } from "./index.js"
import {
  createReportInput,
  fakeHash,
  findReportFile,
  messageHash,
} from "./report-fixtures.test-support.js"

describe("report package integration", () => {
  it("builds all required report files and manifest metadata", async () => {
    const hashedFiles: string[] = []
    const reportPackage = await buildReportPackage(
      createReportInput({
        reviewDecisions: [
          {
            ...createReportInput().reviewDecisions[0]!,
            reviewNote: "Reviewed 🧪",
          },
        ],
      }),
      async ({ fileName }) => {
        hashedFiles.push(fileName)
        await Promise.resolve()
        return fakeHash
      },
    )

    expect(reportPackage.files.map((file) => file.fileName)).toEqual(
      REQUIRED_REPORT_FILE_NAMES,
    )
    expect(reportPackage.manifest).toMatchObject({
      appVersion: "0.1.0",
      clientId: "northstar-lab",
      profileId: "northstar-oml-o21",
      profileVersion: 3,
      messageHash,
      sourcePolicy: "raw_source_excluded",
    })
    expect(reportPackage.manifest.includedFiles).toHaveLength(6)
    expect(hashedFiles).toEqual(
      REQUIRED_REPORT_FILE_NAMES.filter(
        (fileName) => fileName !== "manifest.json",
      ),
    )
    const markdown = findReportFile(reportPackage, "REPORT.md")
    const manifestEntry = reportPackage.manifest.includedFiles.find(
      (file) => file.fileName === "REPORT.md",
    )
    expect(manifestEntry?.byteLength).toBe(
      new TextEncoder().encode(markdown.content).byteLength,
    )
    expect(reportPackage.files.map((file) => file.fileName)).not.toContain(
      "source.hl7",
    )
  })

  it("reproduces report package files for identical inputs", async () => {
    const input = createReportInput({
      generatedAt: "2026-07-09T00:32:00-07:00",
    })
    const firstPackage = await buildReportPackage(input, () => fakeHash)
    const secondPackage = await buildReportPackage(input, () => fakeHash)

    expect(firstPackage.manifest).toEqual(secondPackage.manifest)
    expect(firstPackage.files).toEqual(secondPackage.files)
  })

  it("emits valid machine-readable JSON payloads", async () => {
    const reportPackage = await buildReportPackage(
      createReportInput(),
      () => fakeHash,
    )

    expect(() =>
      NormalizedOutputSchema.parse(
        JSON.parse(
          findReportFile(reportPackage, "normalized-data.json").content,
        ),
      ),
    ).not.toThrow()
    expect(() =>
      Hl7ItemSchema.array().parse(
        JSON.parse(findReportFile(reportPackage, "hl7-items.json").content),
      ),
    ).not.toThrow()
    expect(() =>
      ReportReviewDecisionSchema.array().parse(
        JSON.parse(
          findReportFile(reportPackage, "review-decisions.json").content,
        ),
      ),
    ).not.toThrow()
    expect(() =>
      ValidationSummarySchema.parse(
        JSON.parse(
          findReportFile(reportPackage, "validation-results.json").content,
        ),
      ),
    ).not.toThrow()
  })

  it("reports a missing file from shared report fixtures", async () => {
    const reportPackage = await buildReportPackage(
      createReportInput(),
      () => fakeHash,
    )

    expect(() => findReportFile(reportPackage, "source.hl7")).toThrow(
      "Expected report file source.hl7.",
    )
  })
})
