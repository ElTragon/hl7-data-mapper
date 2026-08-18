import type {
  Hl7Item,
  MessageHash,
  NormalizedOutput,
  ReportFileName,
  ReportManifest,
  ReportPayloadFileName,
  ReportReviewDecision,
  ReportSourcePolicy,
  ValidationSummary,
} from "@hl7-data-mapper/contracts"

export type ReportFile = {
  readonly fileName: ReportFileName
  readonly mediaType: string
  readonly content: string
}
export type ReportPayloadFile = ReportFile & {
  readonly fileName: ReportPayloadFileName
}
export type ReportContentHashInput = {
  readonly fileName: ReportPayloadFileName
  readonly content: string
}
export type ReportContentHasher = (
  input: ReportContentHashInput,
) => MessageHash | Promise<MessageHash>
export type MappingSummaryRow = {
  readonly section: string
  readonly targetPath: string
  readonly valueStatus: string
  readonly sourcePath: string
  readonly hl7ItemId: string
  readonly reviewStatus: string
  readonly transformApplied: string
  readonly reviewReason: string
  readonly reviewNote: string
}
export type ReportExtractionSummary = {
  readonly patientIdentifierCount: number
  readonly coverageCount: number
  readonly hasGuarantor: boolean
  readonly labOrderCount: number
  readonly specimenCount: number
}
export type ReportReviewSummary = {
  readonly total: number
  readonly unreviewed: number
  readonly confirmed: number
  readonly incorrect: number
  readonly mappingChanged: number
  readonly unavailable: number
}
export type BuildReportPackageInput = {
  readonly appVersion: string
  readonly generatedAt: string
  readonly clientId: string
  readonly profileId: string
  readonly profileVersion: number
  readonly messageHash: MessageHash
  readonly messageControlId?: string | null
  readonly sourcePolicy?: ReportSourcePolicy
  readonly normalizedData: NormalizedOutput
  readonly hl7Items: readonly Hl7Item[]
  readonly reviewDecisions: readonly ReportReviewDecision[]
  readonly validationResults: ValidationSummary
  readonly syntheticSourceText?: string | null
}
export type ReportPackage = {
  readonly manifest: ReportManifest
  readonly files: readonly ReportFile[]
}
export type ReportZipOptions = { readonly rootFolderName?: string }
export type ReportZipEntry = {
  readonly path: string
  readonly uncompressedSize: number
}
export type ReportZipPackage = {
  readonly fileName: string
  readonly mediaType: "application/zip"
  readonly content: Uint8Array
  readonly entries: readonly ReportZipEntry[]
}
