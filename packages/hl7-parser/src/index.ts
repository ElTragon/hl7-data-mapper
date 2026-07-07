export const hl7ParserPackage = {
  name: "@hl7-data-mapper/hl7-parser",
  responsibility:
    "Parse raw HL7 v2 text into a structured intermediate representation.",
} as const

export type Hl7ParserPackage = typeof hl7ParserPackage

export { parseHl7Message } from "./parse-hl7-message.js"
export type {
  Hl7Component,
  Hl7Delimiters,
  Hl7Field,
  Hl7Issue,
  Hl7IssueCode,
  Hl7MessageType,
  Hl7Repetition,
  Hl7Segment,
  Hl7Severity,
  ParsedHl7Message,
} from "./types.js"
