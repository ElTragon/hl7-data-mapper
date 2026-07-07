export const mappingEnginePackage = {
  name: "@hl7-data-mapper/mapping-engine",
  responsibility:
    "Apply default and client-specific hl7Item mapping steps to parsed HL7 data.",
  dependsOn: ["@hl7-data-mapper/contracts", "@hl7-data-mapper/hl7-parser"],
} as const

export type MappingEnginePackage = typeof mappingEnginePackage

export {
  composeCoverages,
  composeGuarantor,
  composeLabOrders,
  composeMessageMetadata,
  composePatient,
  composeSender,
  composeSpecimens,
} from "./default-composers.js"

export {
  chooseIdentifier,
  componentValue,
  firstNonEmpty,
  firstRepetition,
  mapAddress,
  mapCodedValue,
  mapEntityIdentifier,
  mapEntityIdentifierFromComponent,
  mapIdentifier,
  mapPersonName,
  mapProvider,
  mapTelecom,
  normalizeHl7Date,
  normalizeHl7Timestamp,
  parseInteger,
  subComponentValue,
} from "./hl7-value-helpers.js"
