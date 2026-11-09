import type {
  Hl7Item,
  SourceExpectation,
  SourceReference,
} from "@hl7-data-mapper/contracts"

import {
  isPersonNameSourceRoleEntry,
  sourceRuleIdentityKey,
} from "../person-name-source-roles.js"
import { expectationMatchesSource } from "../source-expectation.js"
import type { PersonNameSourceRole } from "./types.js"

const PERSON_NAME_SOURCE_ROLES: readonly PersonNameSourceRole[] = [
  "family",
  "given",
  "middle",
  "suffix",
  "prefix",
]

export function replacePersonNameRoleSource({
  item,
  source,
  sourceRole,
  notes,
}: {
  readonly item: Hl7Item
  readonly source: SourceReference
  readonly sourceRole: PersonNameSourceRole
  readonly notes?: string
}): Hl7Item {
  const sourceRoles = buildPersonNameSourceRoles(item)
  const replacementIndex = item.sources.findIndex(
    (existingSource, index) =>
      (sourceRoles.get(sourceRuleIdentityKey(existingSource)) ??
        PERSON_NAME_SOURCE_ROLES[index]) === sourceRole,
  )
  const nextSources =
    replacementIndex >= 0
      ? item.sources.map((existingSource, index) =>
          index === replacementIndex ? source : existingSource,
        )
      : [...item.sources, source]
  const nextSourceRoles = nextSources.map((nextSource, index) => ({
    path: nextSource.path,
    segmentIndex: nextSource.segmentIndex ?? null,
    literalSplit: nextSource.literalSplit,
    role:
      index === replacementIndex ||
      (replacementIndex < 0 && index === nextSources.length - 1)
        ? sourceRole
        : (sourceRoles.get(sourceRuleIdentityKey(nextSource)) ??
          PERSON_NAME_SOURCE_ROLES[index] ??
          "family"),
  }))
  const sourceRoleByIdentity = new Map<string, PersonNameSourceRole>(
    nextSourceRoles.map((entry) => [sourceRuleIdentityKey(entry), entry.role]),
  )

  return {
    ...item,
    sources: nextSources,
    sourceExpectations: buildUpdatedSourceExpectations({
      item,
      nextSources,
      createFallbackExpectation: (nextSource) =>
        createPersonNameSourceExpectation(
          nextSource,
          sourceRoleByIdentity.get(sourceRuleIdentityKey(nextSource)) ??
            "family",
        ),
    }),
    transform: {
      name: "mapXpnName",
      description: item.transform?.description,
      params: {
        ...(item.transform?.params ?? {}),
        sourceRoles: nextSourceRoles,
      },
    },
    notes: appendNote(
      item.notes,
      notes ?? `Use ${source.path} as ${sourceRole} for ${item.targetPath}.`,
    ),
  }
}

export function buildUpdatedSourceExpectations({
  item,
  nextSources,
  createFallbackExpectation = (source) =>
    createFallbackSourceExpectation(item, source),
}: {
  readonly item: Hl7Item
  readonly nextSources: readonly SourceReference[]
  readonly createFallbackExpectation?: (
    source: SourceReference,
  ) => SourceExpectation
}): SourceExpectation[] {
  const previousSourcesAndExpectationsAreAligned =
    item.sources.length === item.sourceExpectations.length &&
    item.sources.every(
      (existingSource, sourceIndex) =>
        item.sourceExpectations[sourceIndex]?.path === existingSource.path &&
        expectationMatchesSource(
          item.sourceExpectations[sourceIndex]!,
          existingSource,
        ),
    )

  return nextSources.map((source) => {
    const previousSourceIndex = item.sources.findIndex(
      (previousSource) =>
        sourceRuleIdentityKey(previousSource) === sourceRuleIdentityKey(source),
    )
    const expectationForSameSource =
      previousSourcesAndExpectationsAreAligned && previousSourceIndex >= 0
        ? item.sourceExpectations[previousSourceIndex]
        : undefined
    if (expectationForSameSource) return expectationForSameSource

    const expectationForUnsplitSource = !source.literalSplit
      ? item.sourceExpectations.find(
          (expectation) =>
            expectation.path === source.path &&
            !expectation.literalSplit &&
            (expectation.segmentIndex === undefined ||
              expectation.segmentIndex === null ||
              expectation.segmentIndex === source.segmentIndex),
        )
      : undefined

    return expectationForUnsplitSource ?? createFallbackExpectation(source)
  })
}

export function appendNote(
  existingNote: string | null | undefined,
  nextNote: string,
): string {
  return existingNote ? `${existingNote}\n${nextNote}` : nextNote
}

function createFallbackSourceExpectation(
  item: Hl7Item,
  source: SourceReference,
): SourceExpectation {
  return {
    path: source.path,
    segmentIndex: source.segmentIndex,
    literalSplit: source.literalSplit,
    expectedLabel: item.label,
    requiredness: item.required ? "required" : "recommended",
    examples: [],
    emptyMeaning: `No value was present at ${source.path}.`,
    guidance: `Review this client-selected source for ${item.targetPath}.`,
  }
}

const ROLE_LABELS: Record<PersonNameSourceRole, string> = {
  family: "Patient family name",
  given: "Patient given name",
  middle: "Patient middle name or initial",
  suffix: "Patient name suffix",
  prefix: "Patient name prefix",
}

const ROLE_EXAMPLES: Record<PersonNameSourceRole, string[]> = {
  family: ["Lopez"],
  given: ["Elena"],
  middle: ["M"],
  suffix: ["Jr", "Sr", "III"],
  prefix: ["Dr", "Mr", "Ms"],
}

function createPersonNameSourceExpectation(
  source: SourceReference,
  role: PersonNameSourceRole,
): SourceExpectation {
  return {
    path: source.path,
    segmentIndex: source.segmentIndex,
    literalSplit: source.literalSplit,
    expectedLabel: ROLE_LABELS[role],
    requiredness:
      role === "family" || role === "given" ? "required" : "optional",
    examples: ROLE_EXAMPLES[role],
    emptyMeaning: `No ${ROLE_LABELS[role].toLowerCase()} was present at ${source.path}.`,
    guidance:
      role === "family" || role === "given"
        ? "Review with the client if this is blank; this is usually needed to identify the patient."
        : `Usually safe to ignore unless this client relies on ${ROLE_LABELS[role].toLowerCase()} values.`,
  }
}

function buildPersonNameSourceRoles(
  item: Hl7Item,
): ReadonlyMap<string, PersonNameSourceRole> {
  const configuredRoles = item.transform?.params["sourceRoles"]
  const roles = new Map<string, PersonNameSourceRole>()

  if (Array.isArray(configuredRoles)) {
    configuredRoles.forEach((entry) => {
      if (isPersonNameSourceRoleEntry(entry)) {
        roles.set(sourceRuleIdentityKey(entry), entry.role)
      }
    })
  }

  item.sources.forEach((source, index) => {
    if (!roles.has(sourceRuleIdentityKey(source))) {
      const role = PERSON_NAME_SOURCE_ROLES[index]
      if (role) roles.set(sourceRuleIdentityKey(source), role)
    }
  })
  return roles
}
