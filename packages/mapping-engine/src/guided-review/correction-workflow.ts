import { executeMapping } from "../execute-mapping.js"
import { stableReviewJson } from "@hl7-data-mapper/contracts"
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
    parsedMessage,
  })
  const mappingResult = executeMapping({
    parsedMessage,
    profile: updatedProfile,
  })

  return {
    correctedItemId:
      updatedProfile.itemSet.items.find(
        (item) =>
          stableReviewJson(item) !==
          stableReviewJson(
            profile.itemSet.items.find((previous) => previous.id === item.id),
          ),
      )?.id ?? field.hl7ItemId,
    profile: updatedProfile,
    mappingResult,
    reviewFields: buildReviewableFields({
      mappingResult,
      profile: updatedProfile,
    }),
  }
}
