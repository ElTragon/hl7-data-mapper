import { describe, expect, it } from "vitest"

import { normalizeZipFolderName } from "./build-report-zip.js"

describe("ZIP folder names", () => {
  it("flattens slash and backslash paths", () => {
    expect(normalizeZipFolderName(" custom/report ")).toBe("custom-report")
    expect(normalizeZipFolderName("custom\\report")).toBe("custom-report")
  })

  it("uses the default for an empty normalized name", () => {
    expect(normalizeZipFolderName(" /// ")).toBe("hl7-data-mapper-report")
  })
})
