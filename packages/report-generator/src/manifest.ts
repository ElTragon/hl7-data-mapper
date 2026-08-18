import type { ReportFileManifestEntry } from "@hl7-data-mapper/contracts"

import { getUtf8ByteLength } from "./serialization.js"
import type { ReportContentHasher, ReportPayloadFile } from "./types.js"

export async function buildManifestEntries(
  files: readonly ReportPayloadFile[],
  hashContent: ReportContentHasher,
): Promise<readonly ReportFileManifestEntry[]> {
  const entries = await Promise.all(
    files.map(async (file) => ({
      fileName: file.fileName,
      mediaType: file.mediaType,
      byteLength: getUtf8ByteLength(file.content),
      sha256: await hashContent({
        fileName: file.fileName,
        content: file.content,
      }),
    })),
  )
  return files.map((file) => {
    const entry = entries.find(
      (candidate) => candidate.fileName === file.fileName,
    )
    if (!entry) throw new Error(`Missing report payload file: ${file.fileName}`)
    return entry
  })
}
