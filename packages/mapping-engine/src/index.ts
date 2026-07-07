export const mappingEnginePackage = {
  name: "@hl7-data-mapper/mapping-engine",
  responsibility:
    "Apply default and client-specific hl7Item mapping steps to parsed HL7 data.",
  dependsOn: ["@hl7-data-mapper/contracts", "@hl7-data-mapper/hl7-parser"],
} as const

export type MappingEnginePackage = typeof mappingEnginePackage

export { executeMapping } from "./execute-mapping.js"
export type {
  ExecuteMappingInput,
  MappingExecutionResult,
  MappingExecutionStatus,
  MappingExecutionTraceEntry,
} from "./execute-mapping.js"

export {
  getOrderGroups,
  getSegmentsByName,
  readSource,
  readSourceValue,
} from "./source-lookup.js"
export type {
  Hl7OrderGroup,
  Hl7SourceRead,
  Hl7SourceReadStatus,
} from "./source-lookup.js"

export {
  defaultOmlO21ClientProfile,
  defaultOmlO21Items,
} from "./profiles/default-oml-o21-profile.js"
