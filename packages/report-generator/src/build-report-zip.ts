import { strToU8, zipSync } from "fflate"

import type {
  ReportPackage,
  ReportZipOptions,
  ReportZipPackage,
} from "./types.js"

export function buildReportZip(
  reportPackage: ReportPackage,
  options: ReportZipOptions = {},
): ReportZipPackage {
  const rootFolderName = normalizeZipFolderName(
    options.rootFolderName ?? "hl7-data-mapper-report",
  )
  const zipEntries = reportPackage.files.map((file) => ({
    path: `${rootFolderName}/${file.fileName}`,
    bytes: strToU8(file.content),
  }))
  return {
    fileName: `${rootFolderName}.zip`,
    mediaType: "application/zip",
    content: zipSync(
      Object.fromEntries(zipEntries.map((entry) => [entry.path, entry.bytes])),
    ),
    entries: zipEntries.map((entry) => ({
      path: entry.path,
      uncompressedSize: entry.bytes.byteLength,
    })),
  }
}

export function normalizeZipFolderName(folderName: string): string {
  return (
    folderName
      .trim()
      .replaceAll("\\", "/")
      .split("/")
      .filter(Boolean)
      .join("-") || "hl7-data-mapper-report"
  )
}
