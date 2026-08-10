import { REQUIRED_REPORT_FILE_NAMES } from "@hl7-data-mapper/contracts"

import type { ReportFile } from "./types.js"

export function orderReportFiles(
  files: readonly ReportFile[],
): readonly ReportFile[] {
  const optional = files.filter(
    (file) =>
      !REQUIRED_REPORT_FILE_NAMES.some((name) => name === file.fileName),
  )
  return [
    ...REQUIRED_REPORT_FILE_NAMES.map((fileName) => {
      const file = files.find((candidate) => candidate.fileName === fileName)
      if (!file) throw new Error(`Missing report file: ${fileName}`)
      return file
    }),
    ...optional,
  ]
}
