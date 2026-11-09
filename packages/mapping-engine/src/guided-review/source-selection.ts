import {
  ClientProfileSchema,
  Hl7ItemSchema,
  SourceReferenceSchema,
  normalizedPathKind,
  type ReviewableField,
  type SourceReference,
} from "@hl7-data-mapper/contracts"

import {
  buildUpdatedSourceExpectations,
  replacePersonNameRoleSource,
} from "./person-name-corrections.js"
import type {
  SelectAlternateSourceInput,
  SelectCompositeFieldSourceInput,
  SelectMultipleSourcesInput,
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
    (candidate) =>
      sourceIdentity(candidate.source) === sourceIdentity(parsedSource),
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
      sourceIdentity(candidate.source) === sourceIdentity(parsedSource),
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

export function selectMultipleSourcesForReviewableField({
  profile,
  field,
  replacementSources,
  joinSeparator,
  notes,
}: SelectMultipleSourcesInput): ReviewableField {
  if (!field.hl7ItemId) {
    throw new Error(
      `Cannot select multiple sources for "${field.label}" because it is not linked to an hl7Item.`,
    )
  }
  if (replacementSources.length < 2) {
    throw new Error("Choose at least two sources for a combined value.")
  }
  if (normalizedPathKind(field.normalizedPath) !== "string") {
    throw new Error("Multiple sources can only replace a string report field.")
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
  if (
    targetItem.targetPath !== field.normalizedPath ||
    targetItem.recordCorrectionIdentity
  ) {
    throw new Error(
      "A repeated record field needs a correction tied to its record before sources can be combined.",
    )
  }
  if (
    targetItem.valueType !== "string" ||
    (targetItem.action !== "extract" && targetItem.action !== "join") ||
    targetItem.transform
  ) {
    throw new Error(
      "Multiple sources can only replace a plain string extract or join mapping item.",
    )
  }

  const parsedSources = replacementSources.map((source) =>
    SourceReferenceSchema.parse(source),
  )
  const replacementItem = Hl7ItemSchema.parse({
    ...targetItem,
    action: "join",
    valueType: "string",
    sources: parsedSources,
    sourceExpectations: buildUpdatedSourceExpectations({
      item: targetItem,
      nextSources: parsedSources,
    }),
    transform: null,
    joinSeparator,
  })
  const knownCandidateKeys = new Set(
    field.sourceCandidates.map((candidate) => sourceIdentity(candidate.source)),
  )
  const newCandidates = parsedSources
    .filter((source) => !knownCandidateKeys.has(sourceIdentity(source)))
    .map((source) => ({
      source,
      rawSegment: source.raw ?? null,
      previewValue: null,
      reason: "User-selected source for combined value.",
    }))

  return {
    ...field,
    reviewStatus: "incorrect",
    sourceCandidates: [...field.sourceCandidates, ...newCandidates],
    correctionIntent: {
      targetHl7ItemId: field.hl7ItemId,
      replacementSource: parsedSources[0],
      replacementHl7Item: replacementItem,
      notes:
        notes ??
        `Combined ${parsedSources.length} HL7 sources for ${field.normalizedPath}.`,
    },
  }
}

function sourceIdentity(source: SourceReference): string {
  return JSON.stringify([
    source.path,
    source.segmentIndex ?? null,
    source.literalSplit?.separator ?? null,
    source.literalSplit?.partNumber ?? null,
  ])
}
