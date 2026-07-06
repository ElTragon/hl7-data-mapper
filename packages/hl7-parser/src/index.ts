export const hl7ParserPackage = {
  name: "@hl7-data-mapper/hl7-parser",
  responsibility:
    "Parse raw HL7 v2 text into a structured intermediate representation.",
} as const

export type Hl7ParserPackage = typeof hl7ParserPackage
