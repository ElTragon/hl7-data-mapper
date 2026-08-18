import {
  REPORT_CONTRACT_SCHEMA_VERSION,
  ReportManifestSchema,
} from "@hl7-data-mapper/contracts"

import { buildManifestEntries } from "./manifest.js"
import { buildPayloadFiles } from "./payload-files.js"
import { orderReportFiles } from "./report-files.js"
import { validateReportInput } from "./report-input.js"
import { toPrettyJson } from "./serialization.js"
import type {
  BuildReportPackageInput,
  ReportContentHasher,
  ReportFile,
  ReportPackage,
} from "./types.js"

export async function buildReportPackage(
  input: BuildReportPackageInput,
  hashContent: ReportContentHasher,
): Promise<ReportPackage> {
  const reportInput = validateReportInput(input)
  const payloadFiles = buildPayloadFiles(reportInput)
  const includedFiles = await buildManifestEntries(payloadFiles, hashContent)
  const manifest = ReportManifestSchema.parse({
    schemaVersion: REPORT_CONTRACT_SCHEMA_VERSION,
    appName: "HL7 Data Mapper",
    appVersion: reportInput.appVersion,
    generatedAt: reportInput.generatedAt,
    clientId: reportInput.clientId,
    profileId: reportInput.profileId,
    profileVersion: reportInput.profileVersion,
    hl7Version: "2.5.1",
    messageType: "OML^O21",
    messageStructure: "OML_O21",
    messageControlId: reportInput.messageControlId,
    messageHash: reportInput.messageHash,
    sourcePolicy: reportInput.sourcePolicy ?? "raw_source_excluded",
    generatedBy: "browser",
    includedFiles,
  })
  const manifestFile: ReportFile = {
    fileName: "manifest.json",
    mediaType: "application/json",
    content: toPrettyJson(manifest),
  }
  return {
    manifest,
    files: orderReportFiles([...payloadFiles, manifestFile]),
  }
}
