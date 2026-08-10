import { executeMapping } from "../execute-mapping.js"
import { buildReviewableFields } from "./build-reviewable-fields.js"
import { applyReviewFieldCorrectionToProfile } from "./profile-corrections.js"
import type {
  ApplyReviewCorrectionAndRerunInput,
  ApplyReviewCorrectionAndRerunResult,
} from "./types.js"

export function applyReviewCorrectionAndRerunMapping({
  parsedMessage,
  profile,
  field,
  updatedAt,
}: ApplyReviewCorrectionAndRerunInput): ApplyReviewCorrectionAndRerunResult {
  const updatedProfile = applyReviewFieldCorrectionToProfile({
    profile,
    field,
    updatedAt,
  })
  const mappingResult = executeMapping({
    parsedMessage,
    profile: updatedProfile,
  })

  return {
    profile: updatedProfile,
    mappingResult,
    reviewFields: buildReviewableFields({
      mappingResult,
      profile: updatedProfile,
    }),
  }
}
