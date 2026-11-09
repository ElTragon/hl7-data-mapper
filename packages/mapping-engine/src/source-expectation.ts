import type {
  SourceExpectation,
  SourceReference,
} from "@hl7-data-mapper/contracts"

import type { Hl7SourceRead } from "./source-lookup.js"

/** Match the expectation for one read without confusing split parts of one path. */
export function findSourceExpectationForRead(
  expectations: readonly SourceExpectation[],
  sourceReads: readonly Hl7SourceRead[],
  sourceIndex: number,
): SourceExpectation | null {
  const source = sourceReads[sourceIndex]?.source
  if (!source) return null

  const expectationForExactSplit = expectations.find(
    (expectation) =>
      expectation.literalSplit !== undefined &&
      expectationMatchesSource(expectation, source),
  )
  if (expectationForExactSplit) return expectationForExactSplit

  if (!source.literalSplit) {
    const expectationForExactRow = expectations.find(
      (expectation) =>
        expectation.segmentIndex !== undefined &&
        expectation.segmentIndex !== null &&
        expectationMatchesSource(expectation, source),
    )
    if (expectationForExactRow) return expectationForExactRow
  }

  const expectationsFollowSourceOrder =
    expectations.length === sourceReads.length &&
    expectations.every(
      (expectation, index) =>
        expectation.path === sourceReads[index]?.source.path &&
        expectationMatchesSource(expectation, sourceReads[index]!.source),
    )
  if (expectationsFollowSourceOrder) {
    return expectations[sourceIndex] ?? null
  }

  return (
    expectations.find(
      (expectation) =>
        expectation.literalSplit === undefined &&
        expectationMatchesSource(expectation, source),
    ) ?? null
  )
}

export function expectationMatchesSource(
  expectation: SourceExpectation,
  source: SourceReference,
): boolean {
  return (
    (expectation.path === source.path ||
      expectation.path === source.path.replace(/\[\d+\]/g, "")) &&
    (expectation.segmentIndex === undefined ||
      expectation.segmentIndex === null ||
      expectation.segmentIndex === source.segmentIndex) &&
    (expectation.literalSplit === undefined ||
      (expectation.literalSplit.separator === source.literalSplit?.separator &&
        expectation.literalSplit.partNumber ===
          source.literalSplit?.partNumber))
  )
}
