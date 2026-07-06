export const contractsPackage = {
  name: "@hl7-data-mapper/contracts",
  responsibility:
    "Shared schemas and TypeScript types for normalized HL7 extraction data.",
} as const

export type ContractsPackage = typeof contractsPackage
