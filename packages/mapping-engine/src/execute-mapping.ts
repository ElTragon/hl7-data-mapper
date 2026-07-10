import {
  canExecuteClientProfile,
  ClientProfileSchema,
  createValidationSummary,
  sortHl7ItemsForExecution,
  type Address,
  type ClientProfile,
  type CodedValue,
  type Coverage,
  type EntityIdentifier,
  type Guarantor,
  type Hl7Item,
  type Identifier,
  type LabOrder,
  type NormalizedField,
  type PersonName,
  type Provider,
  type Specimen,
  type SourceExpectation,
  type SourceReference,
  type Telecom,
  type ValidationIssue,
  type ValidationSummary,
} from "@hl7-data-mapper/contracts"
import type { ParsedHl7Message } from "@hl7-data-mapper/hl7-parser"

import { readSource, type Hl7SourceRead } from "./source-lookup.js"

export type MappingExecutionStatus =
  "completed" | "completed_with_warnings" | "error" | "pending_transform"

export type MappingExecutionTraceEntry = {
  readonly itemId: string
  readonly sequence: number
  readonly targetPath: string
  readonly status: MappingExecutionStatus
  readonly sourcesRead: readonly SourceReference[]
  readonly sourceReads: readonly Hl7SourceRead[]
  readonly sourceExpectations: readonly SourceExpectation[]
  readonly inputValues: readonly unknown[]
  readonly outputValue: unknown
  readonly validationIssues: readonly ValidationIssue[]
}

export type MappingExecutionResult = {
  readonly profile: {
    readonly clientId: string
    readonly profileId: string
    readonly profileVersion: number
    readonly status: ClientProfile["status"]
  }
  readonly normalizedDraft: Record<string, unknown>
  readonly normalizedFields: readonly NormalizedField<unknown>[]
  readonly validation: ValidationSummary
  readonly executionTrace: readonly MappingExecutionTraceEntry[]
}

export type ExecuteMappingInput = {
  readonly parsedMessage: ParsedHl7Message
  readonly profile: ClientProfile
}

export function executeMapping({
  parsedMessage,
  profile,
}: ExecuteMappingInput): MappingExecutionResult {
  const parsedProfile = ClientProfileSchema.parse(profile)

  if (!canExecuteClientProfile(parsedProfile)) {
    throw new Error(
      `Client profile "${parsedProfile.profileId}" version ${parsedProfile.profileVersion} cannot be executed while status is "${parsedProfile.status}".`,
    )
  }

  const normalizedDraft: Record<string, unknown> = {}
  const fields: NormalizedField<unknown>[] = []
  const trace: MappingExecutionTraceEntry[] = []
  const issues: ValidationIssue[] = []
  const itemOutputs = new Map<string, unknown>()

  for (const item of sortHl7ItemsForExecution(parsedProfile.itemSet.items)) {
    const itemResult = executeItem({
      item,
      parsedMessage,
      itemOutputs,
    })

    itemOutputs.set(item.id, itemResult.outputValue)
    issues.push(...itemResult.validationIssues)
    trace.push(itemResult)

    setValueAtPath(normalizedDraft, item.targetPath, itemResult.outputValue)

    fields.push({
      key: item.targetPath,
      label: item.label,
      value: itemResult.outputValue,
      sources: item.sources,
      primarySource: item.sources[0] ?? null,
      transformHistory: item.transform
        ? [
            {
              name: item.transform.name,
              description: item.transform.description,
            },
          ]
        : [],
      validation: itemResult.validationIssues,
      reviewStatus: "unreviewed",
      warnings: itemResult.validationIssues
        .filter((issue) => issue.severity === "warning")
        .map((issue) => issue.message),
    })
  }

  return {
    profile: {
      clientId: parsedProfile.clientId,
      profileId: parsedProfile.profileId,
      profileVersion: parsedProfile.profileVersion,
      status: parsedProfile.status,
    },
    normalizedDraft,
    normalizedFields: fields,
    validation: createValidationSummary(issues),
    executionTrace: trace,
  }
}

function executeItem({
  item,
  parsedMessage,
  itemOutputs,
}: {
  item: Hl7Item
  parsedMessage: ParsedHl7Message
  itemOutputs: ReadonlyMap<string, unknown>
}): MappingExecutionTraceEntry {
  const input = readItemInput(item, parsedMessage, itemOutputs)
  const issues: ValidationIssue[] = []
  const pendingTransform = isPendingTransform(item)
  const outputValue = pendingTransform
    ? null
    : applySupportedAction(item, input.values, input.sourceReads)

  if (pendingTransform) {
    issues.push({
      code: "pending-transform",
      severity: "info",
      message: `Transform "${item.transform?.name}" is declared but not implemented in the generic executor yet.`,
      fieldKey: item.targetPath,
      section: item.section,
      source: item.sources[0] ?? null,
    })
  }

  if (item.required && isMissingValue(outputValue) && !pendingTransform) {
    issues.push({
      code: "missing-required-value",
      severity: "error",
      message: `Required mapping item "${item.label}" did not produce a value.`,
      fieldKey: item.targetPath,
      section: item.section,
      source: item.sources[0] ?? null,
    })
  }

  if (
    item.action === "validate" &&
    item.transform?.name === "mustEqual" &&
    outputValue !== item.transform.params["expected"]
  ) {
    issues.push({
      code: "unexpected-value",
      severity: "error",
      message: `Expected "${item.label}" to equal "${String(item.transform.params["expected"])}".`,
      fieldKey: item.targetPath,
      section: item.section,
      source: item.sources[0] ?? null,
    })
  }

  const status = getTraceStatus(issues, pendingTransform)

  return {
    itemId: item.id,
    sequence: item.sequence,
    targetPath: item.targetPath,
    status,
    sourcesRead: item.sources,
    sourceReads: input.sourceReads,
    sourceExpectations: item.sourceExpectations,
    inputValues: input.values,
    outputValue,
    validationIssues: issues,
  }
}

function readItemInput(
  item: Hl7Item,
  parsedMessage: ParsedHl7Message,
  itemOutputs: ReadonlyMap<string, unknown>,
): {
  readonly values: readonly unknown[]
  readonly sourceReads: readonly Hl7SourceRead[]
} {
  if (item.sources.length > 0) {
    const sourceReads = item.sources.map((source) =>
      readSource(parsedMessage, source),
    )

    return {
      values: sourceReads.map((sourceRead) => sourceRead.value),
      sourceReads,
    }
  }

  return {
    values: item.dependsOn.map((dependencyId) => itemOutputs.get(dependencyId)),
    sourceReads: [],
  }
}

function applySupportedAction(
  item: Hl7Item,
  inputValues: readonly unknown[],
  sourceReads: readonly Hl7SourceRead[],
) {
  const firstValue = inputValues[0]

  if (item.transform?.name === "preferIdentifierType") {
    return mapPreferredIdentifierFromSourceReads(item, sourceReads)
  }

  if (item.transform?.name === "mapXpnName") {
    return mapPersonNameFromSourceValues(item, inputValues)
  }

  if (item.transform?.name === "mapRepeatingXadAddresses") {
    return mapAddressArrayFromSourceValues(inputValues)
  }

  if (item.transform?.name === "mapRepeatingXtnTelecom") {
    return mapTelecomArrayFromSourceValues(inputValues)
  }

  if (item.transform?.name === "mapRepeatingIn1Coverage") {
    return mapCoverageArrayFromSourceValues(inputValues)
  }

  if (item.transform?.name === "mapOptionalGt1Guarantor") {
    return mapGuarantorFromSourceValues(inputValues)
  }

  if (item.transform?.name === "mapOrcOrderGroups") {
    return mapLabOrderArrayFromSourceValues(inputValues)
  }

  if (item.action === "default_value") {
    return item.defaultValue ?? null
  }

  if (item.action === "normalize_date") {
    return normalizeDate(firstValue)
  }

  if (item.action === "normalize_timestamp") {
    return normalizeTimestamp(firstValue)
  }

  if (item.action === "join") {
    return inputValues.filter((value) => !isMissingValue(value)).join("")
  }

  if (item.action === "extract" || item.action === "validate") {
    return inputValues.length <= 1 ? (firstValue ?? null) : inputValues
  }

  return firstValue ?? null
}

function isPendingTransform(item: Hl7Item): boolean {
  if (!item.transform) {
    return false
  }

  return !SUPPORTED_TRANSFORMS.has(item.transform.name)
}

const SUPPORTED_TRANSFORMS = new Set([
  "mustEqual",
  "preferIdentifierType",
  "mapXpnName",
  "mapRepeatingXadAddresses",
  "mapRepeatingXtnTelecom",
  "mapRepeatingIn1Coverage",
  "mapOptionalGt1Guarantor",
  "mapOrcOrderGroups",
])

function mapPreferredIdentifierFromSourceReads(
  item: Hl7Item,
  sourceReads: readonly Hl7SourceRead[],
): Identifier | null {
  const preferredType = stringOrNull(item.transform?.params["preferredType"])
  const identifierFields = sourceReads
    .map((sourceRead) => sourceRead.rawField ?? sourceRead.value)
    .filter((value): value is string => stringOrNull(value) !== null)

  const identifiers = identifierFields.flatMap((fieldValue) =>
    fieldValue
      .split("~")
      .map((repetition) => mapIdentifier(stringOrNull(repetition)))
      .filter((identifier): identifier is Identifier => identifier !== null),
  )

  if (identifiers.length === 0) {
    return null
  }

  return (
    identifiers.find((identifier) => identifier.type === preferredType) ??
    identifiers[0] ??
    null
  )
}

function mapPersonNameFromSourceValues(
  item: Hl7Item,
  inputValues: readonly unknown[],
): PersonName {
  const nameParts: PersonName = {
    family: null,
    given: null,
    middle: null,
    suffix: null,
    prefix: null,
  }

  item.sources.forEach((source, index) => {
    const role = getPersonNameSourceRole(item, source, index)
    const value = stringOrNull(inputValues[index])

    if (role && value !== null) {
      nameParts[role] = value
    }
  })

  return nameParts
}

type PersonNameSourceRole = keyof PersonName

const DEFAULT_PERSON_NAME_SOURCE_ROLES: readonly PersonNameSourceRole[] = [
  "family",
  "given",
  "middle",
  "suffix",
  "prefix",
]

function getPersonNameSourceRole(
  item: Hl7Item,
  source: SourceReference,
  sourceIndex: number,
): PersonNameSourceRole | null {
  const configuredRoles = item.transform?.params["sourceRoles"]

  if (Array.isArray(configuredRoles)) {
    const configuredRole = configuredRoles.find(
      (entry) =>
        isSourceRoleEntry(entry) &&
        entry.path === source.path &&
        (entry.segmentIndex ?? null) === (source.segmentIndex ?? null),
    )

    if (configuredRole) {
      return configuredRole.role
    }
  }

  return DEFAULT_PERSON_NAME_SOURCE_ROLES[sourceIndex] ?? null
}

function isSourceRoleEntry(value: unknown): value is {
  readonly path: string
  readonly segmentIndex?: number | null
  readonly role: PersonNameSourceRole
} {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as {
    readonly path?: unknown
    readonly segmentIndex?: unknown
    readonly role?: unknown
  }

  return (
    typeof candidate.path === "string" &&
    (candidate.segmentIndex === undefined ||
      candidate.segmentIndex === null ||
      typeof candidate.segmentIndex === "number") &&
    isPersonNameSourceRole(candidate.role)
  )
}

function isPersonNameSourceRole(role: unknown): role is PersonNameSourceRole {
  return (
    role === "family" ||
    role === "given" ||
    role === "middle" ||
    role === "suffix" ||
    role === "prefix"
  )
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmedValue = value.trim()

  return trimmedValue.length > 0 ? trimmedValue : null
}

function mapAddressArrayFromSourceValues(inputValues: readonly unknown[]) {
  const address: Address = {
    street: stringOrNull(inputValues[0]),
    city: stringOrNull(inputValues[1]),
    state: stringOrNull(inputValues[2]),
    postalCode: stringOrNull(inputValues[3]),
    country: stringOrNull(inputValues[4]),
  }

  return hasAnyObjectValue(address) ? [address] : []
}

function mapTelecomArrayFromSourceValues(inputValues: readonly unknown[]) {
  const telecom: Telecom = {
    use: stringOrNull(inputValues[0]),
    equipmentType: stringOrNull(inputValues[1]),
    countryCode: stringOrNull(inputValues[2]),
    areaCode: stringOrNull(inputValues[3]),
    localNumber: stringOrNull(inputValues[4]),
  }

  return hasAnyObjectValue(telecom) ? [telecom] : []
}

function mapCoverageArrayFromSourceValues(
  inputValues: readonly unknown[],
): Coverage[] {
  if (!inputValues.some((value) => stringOrNull(value) !== null)) {
    return []
  }

  return [
    {
      sequence: parsePositiveInteger(stringOrNull(inputValues[0])) ?? 1,
      plan: mapCodedValue(stringOrNull(inputValues[1])) ?? {
        code: "",
        display: null,
        system: null,
      },
      insurer: {
        id: firstComponent(stringOrNull(inputValues[2])),
        name: firstComponent(stringOrNull(inputValues[3])),
      },
      groupNumber: stringOrNull(inputValues[4]),
      policyNumber: stringOrNull(inputValues[7]),
      subscriber: {
        name: mapPersonNameField(stringOrNull(inputValues[5])),
        relationship: mapCodedValue(stringOrNull(inputValues[6])),
      },
    },
  ]
}

function mapGuarantorFromSourceValues(
  inputValues: readonly unknown[],
): Guarantor | null {
  if (!inputValues.some((value) => stringOrNull(value) !== null)) {
    return null
  }

  return {
    identifier: mapIdentifier(stringOrNull(inputValues[0])),
    name: mapPersonNameField(stringOrNull(inputValues[1])),
    address: mapAddressField(stringOrNull(inputValues[2])),
    telecom: mapTelecomField(stringOrNull(inputValues[3])),
    dateOfBirth: normalizeDate(stringOrNull(inputValues[4])),
    administrativeSex: stringOrNull(inputValues[5]),
    type: stringOrNull(inputValues[6]),
    relationship: mapCodedValue(stringOrNull(inputValues[7])),
  }
}

function mapLabOrderArrayFromSourceValues(
  inputValues: readonly unknown[],
): LabOrder[] {
  if (!inputValues.some((value) => stringOrNull(value) !== null)) {
    return []
  }

  const specimen = mapSpecimenFromSourceValues(inputValues.slice(13))

  return [
    {
      controlCode: stringOrNull(inputValues[0]),
      placerOrderNumber:
        mapEntityIdentifier(stringOrNull(inputValues[9])) ??
        mapEntityIdentifier(stringOrNull(inputValues[1])),
      fillerOrderNumber:
        mapEntityIdentifier(stringOrNull(inputValues[10])) ??
        mapEntityIdentifier(stringOrNull(inputValues[2])),
      status: stringOrNull(inputValues[3]),
      transactionAt: normalizeTimestamp(stringOrNull(inputValues[4])),
      orderingProvider:
        mapProvider(stringOrNull(inputValues[5])) ??
        mapProvider(stringOrNull(inputValues[12])),
      timing: {
        startAt: normalizeTimestamp(stringOrNull(inputValues[6])),
        endAt: normalizeTimestamp(stringOrNull(inputValues[7])),
        priority: mapCodedValue(stringOrNull(inputValues[8])),
      },
      service: mapCodedValue(stringOrNull(inputValues[11])) ?? {
        code: "",
        display: null,
        system: null,
      },
      specimens: specimen ? [specimen] : [],
    },
  ]
}

function mapSpecimenFromSourceValues(
  inputValues: readonly unknown[],
): Specimen | null {
  if (!inputValues.some((value) => stringOrNull(value) !== null)) {
    return null
  }

  const specimenId = stringOrNull(inputValues[1])
  const collected = stringOrNull(inputValues[4])

  return {
    sequence: parsePositiveInteger(stringOrNull(inputValues[0])) ?? 1,
    placerId: mapEntityIdentifierFromComponent(component(specimenId, 1)),
    fillerId: mapEntityIdentifierFromComponent(component(specimenId, 2)),
    type: mapCodedValue(stringOrNull(inputValues[2])),
    role: mapCodedValue(stringOrNull(inputValues[3])),
    collected: {
      startAt: normalizeTimestamp(component(collected, 1)),
      endAt: normalizeTimestamp(component(collected, 2)),
    },
    receivedAt: normalizeTimestamp(stringOrNull(inputValues[5])),
    containerType: mapCodedValue(stringOrNull(inputValues[6])),
  }
}

function mapAddressField(value: string | null): Address | null {
  if (!value) {
    return null
  }

  const street = component(value, 1)

  return {
    street: subComponent(street, 1) ?? street,
    city: component(value, 3),
    state: component(value, 4),
    postalCode: component(value, 5),
    country: component(value, 6),
  }
}

function mapTelecomField(value: string | null): Telecom | null {
  if (!value) {
    return null
  }

  return {
    use: component(value, 2),
    equipmentType: component(value, 3),
    countryCode: component(value, 5),
    areaCode: component(value, 6),
    localNumber: component(value, 7) ?? firstComponent(value),
  }
}

function mapPersonNameField(value: string | null): PersonName {
  return {
    family: component(value, 1),
    given: component(value, 2),
    middle: component(value, 3),
    suffix: component(value, 4),
    prefix: component(value, 5),
  }
}

function mapIdentifier(value: string | null): Identifier | null {
  const identifierValue = component(value, 1)

  if (!identifierValue) {
    return null
  }

  return {
    value: identifierValue,
    assigningAuthority: component(value, 4),
    type: component(value, 5),
  }
}

function mapEntityIdentifier(value: string | null): EntityIdentifier | null {
  const entityValue = component(value, 1)

  if (!entityValue) {
    return null
  }

  return {
    value: entityValue,
    namespaceId: component(value, 2),
  }
}

function mapEntityIdentifierFromComponent(
  value: string | null,
): EntityIdentifier | null {
  const entityValue = subComponent(value, 1)

  if (!entityValue) {
    return null
  }

  return {
    value: entityValue,
    namespaceId: subComponent(value, 2),
  }
}

function mapCodedValue(value: string | null): CodedValue | null {
  const code = component(value, 1)

  if (!code) {
    return null
  }

  return {
    code,
    display: component(value, 2),
    system: component(value, 3),
  }
}

function mapProvider(value: string | null): Provider | null {
  if (!value) {
    return null
  }

  return {
    id: component(value, 1),
    family: component(value, 2),
    given: component(value, 3),
  }
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null
  }

  return Number(value)
}

function firstComponent(value: string | null): string | null {
  return component(value, 1)
}

function component(value: string | null, index: number): string | null {
  return emptyToNull(value?.split("^")[index - 1])
}

function subComponent(value: string | null, index: number): string | null {
  return emptyToNull(value?.split("&")[index - 1])
}

function emptyToNull(value: string | undefined): string | null {
  if (value === undefined) {
    return null
  }

  const trimmedValue = value.trim()

  return trimmedValue.length > 0 ? trimmedValue : null
}

function hasAnyObjectValue(value: Record<string, unknown>): boolean {
  return Object.values(value).some((entry) => entry !== null && entry !== "")
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8) {
    return null
  }

  const compactDate = value.slice(0, 8)

  if (!/^\d{8}$/.test(compactDate)) {
    return null
  }

  return `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8) {
    return null
  }

  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?([+-]\d{4})?$/,
  )

  if (!match) {
    return null
  }

  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match
  const offset = formatTimezoneOffset(match[7])

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`
}

function formatTimezoneOffset(offset: string | undefined): string {
  if (!offset) {
    return "Z"
  }

  return `${offset.slice(0, 3)}:${offset.slice(3)}`
}

function getTraceStatus(
  issues: readonly ValidationIssue[],
  pendingTransform: boolean,
): MappingExecutionStatus {
  if (issues.some((issue) => issue.severity === "error")) {
    return "error"
  }

  if (pendingTransform) {
    return "pending_transform"
  }

  if (issues.length > 0) {
    return "completed_with_warnings"
  }

  return "completed"
}

function setValueAtPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".")
  let cursor: Record<string, unknown> = target

  for (const [index, part] of parts.entries()) {
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/)
    const key = arrayMatch?.[1] ?? part
    const isLast = index === parts.length - 1

    if (!key) {
      return
    }

    if (arrayMatch) {
      const arrayIndex = Number(arrayMatch[2])
      const existing = cursor[key]
      const array = Array.isArray(existing) ? existing : []
      cursor[key] = array

      if (isLast) {
        array[arrayIndex] = value
        return
      }

      array[arrayIndex] =
        typeof array[arrayIndex] === "object" && array[arrayIndex] !== null
          ? array[arrayIndex]
          : {}
      cursor = array[arrayIndex] as Record<string, unknown>
      continue
    }

    if (isLast) {
      cursor[key] = value
      return
    }

    cursor[key] =
      typeof cursor[key] === "object" && cursor[key] !== null ? cursor[key] : {}
    cursor = cursor[key] as Record<string, unknown>
  }
}

function isMissingValue(value: unknown): boolean {
  return value === null || value === undefined || value === ""
}
