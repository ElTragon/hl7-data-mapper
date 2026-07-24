import type { SourceOption } from "./source-options"

export function getCandidateBlockReason(
  candidate: SourceOption | null,
  isPersonNameField: boolean,
): string | null {
  if (!candidate) {
    return null
  }

  if (candidate.previewValue === "") {
    return "This source exists but is empty in the current message."
  }

  if (isPersonNameField && candidate.valueShape !== "scalar") {
    return "Choose a scalar component for a name part instead of the complete composite or repeated field."
  }

  return null
}
