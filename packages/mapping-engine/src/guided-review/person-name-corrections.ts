import type {
  Hl7Item,
  SourceExpectation,
  SourceReference,
} from "@hl7-data-mapper/contracts"

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
      (sourceRoles.get(sourceKey(existingSource)) ??
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
    role:
      index === replacementIndex ||
      (replacementIndex < 0 && index === nextSources.length - 1)
        ? sourceRole
        : (sourceRoles.get(sourceKey(nextSource)) ??
          PERSON_NAME_SOURCE_ROLES[index] ??
          "family"),
  }))
  const sourceRoleByPath = new Map<string, PersonNameSourceRole>(
    nextSourceRoles.map((entry) => [entry.path, entry.role]),
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
          sourceRoleByPath.get(nextSource.path) ?? "family",
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
  return nextSources.map((source) => {
    const existing = item.sourceExpectations.find(
      (expectation) => expectation.path === source.path,
    )
    return existing ?? createFallbackExpectation(source)
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
      if (isSourceRoleEntry(entry)) {
        roles.set(sourceKey(entry), entry.role)
      }
    })
  }

  item.sources.forEach((source, index) => {
    if (!roles.has(sourceKey(source))) {
      const role = PERSON_NAME_SOURCE_ROLES[index]
      if (role) roles.set(sourceKey(source), role)
    }
  })
  return roles
}

function isSourceRoleEntry(value: unknown): value is {
  readonly path: string
  readonly segmentIndex?: number | null
  readonly role: PersonNameSourceRole
} {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate["path"] === "string" &&
    (candidate["segmentIndex"] === undefined ||
      candidate["segmentIndex"] === null ||
      typeof candidate["segmentIndex"] === "number") &&
    PERSON_NAME_SOURCE_ROLES.includes(candidate["role"] as PersonNameSourceRole)
  )
}

function sourceKey({
  path,
  segmentIndex,
}: {
  readonly path: string
  readonly segmentIndex?: number | null
}): string {
  return `${segmentIndex ?? "first"}:${path}`
}
