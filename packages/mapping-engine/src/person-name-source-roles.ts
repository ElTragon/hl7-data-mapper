import type { PersonName, SourceReference } from "@hl7-data-mapper/contracts"

type PersonNameSourceRole = keyof PersonName

export type PersonNameSourceRoleEntry = Pick<
  SourceReference,
  "path" | "segmentIndex" | "literalSplit"
> & {
  readonly role: PersonNameSourceRole
}

const PERSON_NAME_SOURCE_ROLES: readonly PersonNameSourceRole[] = [
  "family",
  "given",
  "middle",
  "suffix",
  "prefix",
]

export function sourceRuleIdentityKey(
  source: Pick<SourceReference, "path" | "segmentIndex" | "literalSplit">,
): string {
  return JSON.stringify([
    source.path,
    source.segmentIndex ?? null,
    source.literalSplit?.separator ?? null,
    source.literalSplit?.partNumber ?? null,
  ])
}

export function isPersonNameSourceRoleEntry(
  value: unknown,
): value is PersonNameSourceRoleEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const candidate = value as Record<string, unknown>
  const literalSplit = candidate["literalSplit"]
  const validLiteralSplit =
    literalSplit === undefined || isLiteralSplitRule(literalSplit)

  return (
    typeof candidate["path"] === "string" &&
    (candidate["segmentIndex"] === undefined ||
      candidate["segmentIndex"] === null ||
      (Number.isInteger(candidate["segmentIndex"]) &&
        (candidate["segmentIndex"] as number) >= 0)) &&
    validLiteralSplit &&
    PERSON_NAME_SOURCE_ROLES.includes(candidate["role"] as PersonNameSourceRole)
  )
}

function isLiteralSplitRule(
  value: unknown,
): value is NonNullable<SourceReference["literalSplit"]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate["separator"] === "string" &&
    candidate["separator"].length > 0 &&
    candidate["separator"].length <= 32 &&
    Number.isInteger(candidate["partNumber"]) &&
    (candidate["partNumber"] as number) > 0
  )
}
