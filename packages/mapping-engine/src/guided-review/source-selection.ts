import {
  ClientProfileSchema,
  SourceReferenceSchema,
  type ReviewableField,
} from "@hl7-data-mapper/contracts"

import { replacePersonNameRoleSource } from "./person-name-corrections.js"
import type {
  SelectAlternateSourceInput,
  SelectCompositeFieldSourceInput,
} from "./types.js"

export function selectAlternateSourceForReviewableField({
  field,
  replacementSource,
  rawSegment,
  previewValue,
  reason,
  notes,
}: SelectAlternateSourceInput): ReviewableField {
  if (!field.hl7ItemId) {
    throw new Error(
      `Cannot select an alternate source for "${field.label}" because it is not linked to an hl7Item.`,
    )
  }

  const parsedSource = SourceReferenceSchema.parse(replacementSource)
  const candidateAlreadyExists = field.sourceCandidates.some(
    (candidate) => candidate.source.path === parsedSource.path,
  )

  return {
    ...field,
    reviewStatus: "incorrect",
    sourceCandidates: candidateAlreadyExists
      ? field.sourceCandidates
      : [
          ...field.sourceCandidates,
          {
            source: parsedSource,
            rawSegment: rawSegment ?? parsedSource.raw ?? null,
            previewValue: previewValue ?? null,
            reason: reason ?? "User-selected alternate HL7 source.",
          },
        ],
    correctionIntent: {
      targetHl7ItemId: field.hl7ItemId,
      replacementSource: parsedSource,
      notes: notes ?? null,
    },
  }
}

export function selectCompositeSourceForReviewableField({
  profile,
  field,
  replacementSource,
  sourceRole,
  rawSegment,
  previewValue,
  reason,
  notes,
}: SelectCompositeFieldSourceInput): ReviewableField {
  if (!field.hl7ItemId) {
    throw new Error(
      `Cannot select a composite source for "${field.label}" because it is not linked to an hl7Item.`,
    )
  }

  const parsedProfile = ClientProfileSchema.parse(profile)
  const targetItem = parsedProfile.itemSet.items.find(
    (item) => item.id === field.hl7ItemId,
  )

  if (!targetItem) {
    throw new Error(
      `Could not find hl7Item "${field.hl7ItemId}" in profile "${parsedProfile.profileId}".`,
    )
  }

  if (targetItem.transform?.name !== "mapXpnName") {
    return selectAlternateSourceForReviewableField({
      field,
      replacementSource,
      rawSegment,
      previewValue,
      reason,
      notes,
    })
  }

  const parsedSource = SourceReferenceSchema.parse(replacementSource)
  const replacementHl7Item = replacePersonNameRoleSource({
    item: targetItem,
    source: parsedSource,
    sourceRole,
    notes,
  })
  const candidateAlreadyExists = field.sourceCandidates.some(
    (candidate) =>
      candidate.source.path === parsedSource.path &&
      (candidate.source.segmentIndex ?? null) ===
        (parsedSource.segmentIndex ?? null),
  )

  return {
    ...field,
    reviewStatus: "incorrect",
    sourceCandidates: candidateAlreadyExists
      ? field.sourceCandidates
      : [
          ...field.sourceCandidates,
          {
            source: parsedSource,
            rawSegment: rawSegment ?? parsedSource.raw ?? null,
            previewValue: previewValue ?? null,
            reason:
              reason ??
              `User-selected ${sourceRole} source for composite person name.`,
          },
        ],
    correctionIntent: {
      targetHl7ItemId: field.hl7ItemId,
      replacementSource: parsedSource,
      replacementHl7Item,
      notes:
        notes ??
        `Use ${parsedSource.path} as ${sourceRole} for ${field.normalizedPath}.`,
    },
  }
}
