import {
  canEditClientProfile,
  ClientProfileSchema,
  type ClientProfile,
} from "@hl7-data-mapper/contracts"

import {
  appendNote,
  buildUpdatedSourceExpectations,
} from "./person-name-corrections.js"
import type { ApplyReviewCorrectionInput } from "./types.js"

export function applyReviewFieldCorrectionToProfile({
  profile,
  field,
  updatedAt,
}: ApplyReviewCorrectionInput): ClientProfile {
  const parsedProfile = ClientProfileSchema.parse(profile)

  if (!canEditClientProfile(parsedProfile)) {
    throw new Error(
      `Client profile "${parsedProfile.profileId}" cannot be edited while status is "${parsedProfile.status}".`,
    )
  }

  const targetId = field.correctionIntent?.targetHl7ItemId ?? field.hl7ItemId
  const replacementSource = field.correctionIntent?.replacementSource
  const replacementItem = field.correctionIntent?.replacementHl7Item

  if (!targetId) {
    throw new Error(
      `Cannot apply a correction for "${field.label}" because it is not linked to an hl7Item.`,
    )
  }
  if (!replacementSource && !replacementItem) {
    throw new Error(
      `Cannot apply a source correction for "${field.label}" because no replacement source was selected.`,
    )
  }

  let didUpdateItem = false
  const updatedItems = parsedProfile.itemSet.items.map((item) => {
    if (item.id !== targetId) return item
    didUpdateItem = true

    if (replacementItem) {
      return {
        ...replacementItem,
        notes: appendNote(
          replacementItem.notes,
          field.correctionIntent?.notes ??
            `Updated composite source from guided review for ${field.normalizedPath}.`,
        ),
      }
    }
    if (!replacementSource) return item

    return {
      ...item,
      sources: [replacementSource],
      sourceExpectations: buildUpdatedSourceExpectations({
        item,
        nextSources: [replacementSource],
      }),
      notes: appendNote(
        item.notes,
        field.correctionIntent?.notes ??
          `Updated source from guided review for ${field.normalizedPath}.`,
      ),
    }
  })

  if (!didUpdateItem) {
    throw new Error(
      `Could not find hl7Item "${targetId}" in profile "${parsedProfile.profileId}".`,
    )
  }

  return ClientProfileSchema.parse({
    ...parsedProfile,
    updatedAt,
    itemSet: { ...parsedProfile.itemSet, items: updatedItems },
  })
}
