import type {
  Hl7Delimiters,
  Hl7Field,
  Hl7Issue,
  Hl7MessageType,
  Hl7Segment,
  ParsedHl7Message,
} from "./types.js"

const DEFAULT_DELIMITERS: Hl7Delimiters = {
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
}

const SEGMENT_NAME_PATTERN = /^[A-Z0-9]{3}$/

export function parseHl7Message(rawText: string): ParsedHl7Message {
  const normalizedText = normalizeSegmentEndings(rawText)
  const rawSegments = splitSegments(normalizedText)
  const delimiters = detectDelimiters(rawSegments[0])
  const issues: Hl7Issue[] = []

  if (rawSegments.length === 0) {
    issues.push({
      code: "empty_message",
      severity: "error",
      message: "HL7 message is empty.",
    })
  }

  if (
    rawSegments.length > 0 &&
    rawSegments[0]?.slice(0, 3) !== "MSH" &&
    rawSegments.some((segment) => segment.slice(0, 3) === "MSH")
  ) {
    issues.push({
      code: "msh_not_first",
      severity: "error",
      message: "MSH segment must be the first segment.",
      segmentIndex: rawSegments.findIndex(
        (segment) => segment.slice(0, 3) === "MSH",
      ),
      segmentName: "MSH",
    })
  }

  if (
    rawSegments.length > 0 &&
    !rawSegments.some((segment) => segment.slice(0, 3) === "MSH")
  ) {
    issues.push({
      code: "missing_msh",
      severity: "error",
      message: "HL7 message must start with an MSH segment.",
      segmentIndex: 0,
      segmentName: rawSegments[0]?.slice(0, 3),
    })
  }

  const segments = rawSegments.map((rawSegment, segmentIndex) =>
    parseSegment(rawSegment, segmentIndex, delimiters, issues),
  )

  const msh = segments.find((segment) => segment.name === "MSH")
  validateMvpProfile(segments, msh, issues)

  const errors = issues.filter((issue) => issue.severity === "error")
  const warnings = issues.filter((issue) => issue.severity === "warning")

  return {
    rawText,
    normalizedText,
    delimiters,
    messageType: getMessageType(msh),
    version: getFieldValue(msh, 12),
    segments,
    errors,
    warnings,
  }
}

function validateMvpProfile(
  segments: readonly Hl7Segment[],
  msh: Hl7Segment | undefined,
  issues: Hl7Issue[],
): void {
  const messageType = getMessageType(msh)
  const version = getFieldValue(msh, 12)

  if (
    msh &&
    (messageType.code !== "OML" ||
      messageType.triggerEvent !== "O21" ||
      messageType.structure !== "OML_O21")
  ) {
    issues.push({
      code: "unsupported_message_type",
      severity: "error",
      message: "Only OML^O21^OML_O21 messages are supported in the MVP.",
      segmentIndex: msh.index,
      segmentName: msh.name,
    })
  }

  if (msh && version !== "2.5.1") {
    issues.push({
      code: "unsupported_hl7_version",
      severity: "error",
      message: "Only HL7 version 2.5.1 is supported in the MVP.",
      segmentIndex: msh.index,
      segmentName: msh.name,
    })
  }

  if (!segments.some((segment) => segment.name === "PID")) {
    issues.push({
      code: "missing_pid",
      severity: "error",
      message: "The MVP application profile requires a PID segment.",
    })
  }

  if (
    !segments.some((segment) => segment.name === "ORC") ||
    !segments.some((segment) => segment.name === "OBR")
  ) {
    issues.push({
      code: "missing_order",
      severity: "error",
      message:
        "The MVP application profile requires ORC and OBR order content.",
    })
  }

  findOrcGroupsMissingSpm(segments).forEach((orcSegment) => {
    issues.push({
      code: "missing_spm",
      severity: "warning",
      message: "Order group has no SPM specimen segment.",
      segmentIndex: orcSegment.index,
      segmentName: orcSegment.name,
    })
  })
}

function findOrcGroupsMissingSpm(
  segments: readonly Hl7Segment[],
): readonly Hl7Segment[] {
  return segments.filter((segment, index) => {
    if (segment.name !== "ORC") {
      return false
    }

    const nextOrcIndex = segments.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index && candidate.name === "ORC",
    )
    const groupEndIndex = nextOrcIndex === -1 ? segments.length : nextOrcIndex
    const orderGroup = segments.slice(index, groupEndIndex)

    return !orderGroup.some((candidate) => candidate.name === "SPM")
  })
}

function normalizeSegmentEndings(rawText: string): string {
  return rawText.replace(/\r\n/g, "\r").replace(/\n/g, "\r").trim()
}

function splitSegments(normalizedText: string): string[] {
  if (normalizedText.length === 0) {
    return []
  }

  return normalizedText
    .split("\r")
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function detectDelimiters(firstSegment: string | undefined): Hl7Delimiters {
  if (!firstSegment?.startsWith("MSH") || firstSegment.length < 8) {
    return DEFAULT_DELIMITERS
  }

  const field = firstSegment[3]
  const encodingCharacters = firstSegment.slice(4, 8)

  if (field === undefined || encodingCharacters.length !== 4) {
    return DEFAULT_DELIMITERS
  }

  const [component, repetition, escape, subcomponent] = encodingCharacters

  if (
    component === undefined ||
    repetition === undefined ||
    escape === undefined ||
    subcomponent === undefined
  ) {
    return DEFAULT_DELIMITERS
  }

  return {
    field,
    component,
    repetition,
    escape,
    subcomponent,
  }
}

function parseSegment(
  rawSegment: string,
  segmentIndex: number,
  delimiters: Hl7Delimiters,
  issues: Hl7Issue[],
): Hl7Segment {
  const parts = rawSegment.split(delimiters.field)
  const name = parts[0] ?? ""

  if (!SEGMENT_NAME_PATTERN.test(name)) {
    issues.push({
      code: "malformed_segment_name",
      severity: "error",
      message: `Segment name "${name}" is malformed.`,
      segmentIndex,
      segmentName: name,
    })
  }

  if (name === "MSH" && rawSegment[3] !== delimiters.field) {
    issues.push({
      code: "invalid_msh",
      severity: "error",
      message: "MSH segment does not contain a valid field separator.",
      segmentIndex,
      segmentName: name,
    })
  }

  return {
    name,
    index: segmentIndex,
    raw: rawSegment,
    fields: parseFields(name, parts, delimiters),
  }
}

function parseFields(
  segmentName: string,
  parts: string[],
  delimiters: Hl7Delimiters,
): Hl7Field[] {
  const fieldValues =
    segmentName === "MSH"
      ? [delimiters.field, ...parts.slice(1)]
      : parts.slice(1)

  return fieldValues.map((rawField, fieldIndex) => {
    const index = fieldIndex + 1

    return {
      path: `${segmentName}-${index}`,
      index,
      raw: rawField,
      repetitions: rawField.split(delimiters.repetition).map((repetition) => ({
        value: repetition,
        components: repetition.split(delimiters.component).map((component) => ({
          value: component,
          subComponents: component.split(delimiters.subcomponent),
        })),
      })),
    }
  })
}

function getMessageType(msh: Hl7Segment | undefined): Hl7MessageType {
  const raw = getFieldValue(msh, 9)
  const components = msh?.fields
    .find((field) => field.index === 9)
    ?.repetitions[0]?.components.map((component) => component.value)

  return {
    code: components?.[0] ?? null,
    triggerEvent: components?.[1] ?? null,
    structure: components?.[2] ?? null,
    raw,
  }
}

function getFieldValue(
  segment: Hl7Segment | undefined,
  fieldIndex: number,
): string | null {
  return (
    segment?.fields.find((field) => field.index === fieldIndex)?.raw ?? null
  )
}
