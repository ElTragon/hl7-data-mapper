import { describe, expect, it } from "vitest"

import { buildReportPackage, buildReportZip } from "./index.js"
import { createReportInput, fakeHash } from "./test-fixtures.js"

const syntheticSource =
  "MSH|^~\\&|SYNTHETIC|LAB|HL7_MAPPER|DEMO|202607090047||OML^O21^OML_O21|MSG1|P|2.5.1\r"

describe("report source policy integration", () => {
  it("includes source.hl7 only for explicitly synthetic reports", async () => {
    const reportPackage = await buildReportPackage(
      createReportInput({
        sourcePolicy: "synthetic_source_included",
        syntheticSourceText: syntheticSource,
        hl7Items: [],
        reviewDecisions: [],
      }),
      () => fakeHash,
    )
    const zipPackage = buildReportZip(reportPackage, {
      rootFolderName: "northstar-lab",
    })

    expect(reportPackage.files.map((file) => file.fileName)).toContain(
      "source.hl7",
    )
    expect(reportPackage.manifest).toMatchObject({
      sourcePolicy: "synthetic_source_included",
    })
    expect(reportPackage.manifest.includedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: "source.hl7",
          mediaType: "text/plain",
        }),
      ]),
    )
    expect(zipPackage.entries.map((entry) => entry.path)).toContain(
      "northstar-lab/source.hl7",
    )
  })

  it("rejects source text without the synthetic policy", async () => {
    await expect(
      buildReportPackage(
        createReportInput({ syntheticSourceText: syntheticSource }),
        () => fakeHash,
      ),
    ).rejects.toThrow(
      "syntheticSourceText can only be included with the synthetic_source_included policy.",
    )
  })

  it("requires source text for the synthetic policy", async () => {
    await expect(
      buildReportPackage(
        createReportInput({
          sourcePolicy: "synthetic_source_included",
          syntheticSourceText: undefined,
        }),
        () => fakeHash,
      ),
    ).rejects.toThrow(
      "syntheticSourceText is required when sourcePolicy is synthetic_source_included.",
    )
  })
})
