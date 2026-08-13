import { REQUIRED_REPORT_FILE_NAMES } from "@hl7-data-mapper/contracts"
import { strFromU8, unzipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { buildReportPackage, buildReportZip } from "./index.js"
import { createReportInput, fakeHash } from "./test-fixtures.js"

describe("report ZIP integration", () => {
  it("builds a downloadable archive with all report files", async () => {
    const reportPackage = await buildReportPackage(
      createReportInput({ hl7Items: [], reviewDecisions: [] }),
      () => fakeHash,
    )
    const zipPackage = buildReportZip(reportPackage)
    const unzippedFiles = unzipSync(zipPackage.content)

    expect(zipPackage).toMatchObject({
      fileName: "hl7-data-mapper-report.zip",
      mediaType: "application/zip",
    })
    expect(zipPackage.entries.map((entry) => entry.path)).toEqual(
      REQUIRED_REPORT_FILE_NAMES.map(
        (fileName) => `hl7-data-mapper-report/${fileName}`,
      ),
    )
    expect(Object.keys(unzippedFiles).sort()).toEqual(
      REQUIRED_REPORT_FILE_NAMES.map(
        (fileName) => `hl7-data-mapper-report/${fileName}`,
      ).sort(),
    )
    expect(
      strFromU8(unzippedFiles["hl7-data-mapper-report/manifest.json"] ?? []),
    ).toContain('"appName": "HL7 Data Mapper"')
    expect(
      strFromU8(unzippedFiles["hl7-data-mapper-report/REPORT.md"] ?? []),
    ).toContain("# HL7 Data Mapper Report")
    expect(
      zipPackage.entries.every((entry) => entry.uncompressedSize > 0),
    ).toBe(true)
    expect(zipPackage.content.byteLength).toBeGreaterThan(0)
  })

  it("supports custom folder names", async () => {
    const reportPackage = await buildReportPackage(
      createReportInput({ hl7Items: [], reviewDecisions: [] }),
      () => fakeHash,
    )
    const zipPackage = buildReportZip(reportPackage, {
      rootFolderName: "custom/report",
    })

    expect(zipPackage.fileName).toBe("custom-report.zip")
    expect(zipPackage.entries[0]?.path).toBe("custom-report/REPORT.md")
  })
})
