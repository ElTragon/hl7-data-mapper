import {
  ClientProfileSchema,
  createSourceReference,
  type ClientProfile,
  type Hl7Item,
  type Hl7ItemAction,
  type Hl7ItemValueType,
  type NormalizedOutputSection,
} from "@hl7-data-mapper/contracts"

const DEFAULT_CLIENT_ID = "default-oml-o21"
const DEFAULT_PROFILE_TIMESTAMP = "2026-07-07T00:00:00-07:00"

type DefaultProfileItemInput = {
  id: string
  sequence: number
  section: NormalizedOutputSection
  targetPath: string
  label: string
  action?: Hl7ItemAction
  valueType?: Hl7ItemValueType
  sources?: Hl7Item["sources"]
  dependsOn?: string[]
  transformName?: string
  transformDescription?: string
  transformParams?: Record<string, unknown>
  required?: boolean
  reviewRequired?: boolean
  notes?: string
}

function source(
  segment: string,
  field: number,
  component?: number,
  subComponent?: number,
) {
  return createSourceReference({
    segment,
    field,
    component,
    subComponent,
  })
}

function item({
  action = "extract",
  valueType = "string",
  sources = [],
  dependsOn = [],
  required = false,
  reviewRequired = true,
  transformName,
  transformDescription,
  transformParams,
  notes,
  ...input
}: DefaultProfileItemInput): Hl7Item {
  return {
    ...input,
    clientId: DEFAULT_CLIENT_ID,
    action,
    valueType,
    sources,
    dependsOn,
    required,
    reviewRequired,
    notes,
    transform: transformName
      ? {
          name: transformName,
          description: transformDescription,
          params: transformParams ?? {},
        }
      : undefined,
  }
}

export const defaultOmlO21Items = [
  item({
    id: "message-sent-at",
    sequence: 1,
    section: "sender",
    targetPath: "message.sentAt",
    label: "Message sent timestamp",
    action: "normalize_timestamp",
    valueType: "timestamp",
    sources: [source("MSH", 7, 1)],
    required: true,
  }),
  item({
    id: "message-type",
    sequence: 2,
    section: "sender",
    targetPath: "message.type",
    label: "Message type",
    action: "validate",
    sources: [source("MSH", 9, 1)],
    required: true,
    transformName: "mustEqual",
    transformParams: { expected: "OML" },
  }),
  item({
    id: "message-trigger-event",
    sequence: 3,
    section: "sender",
    targetPath: "message.triggerEvent",
    label: "Message trigger event",
    action: "validate",
    sources: [source("MSH", 9, 2)],
    required: true,
    transformName: "mustEqual",
    transformParams: { expected: "O21" },
  }),
  item({
    id: "message-structure",
    sequence: 4,
    section: "sender",
    targetPath: "message.structure",
    label: "Message structure",
    action: "validate",
    sources: [source("MSH", 9, 3)],
    required: true,
    transformName: "mustEqual",
    transformParams: { expected: "OML_O21" },
  }),
  item({
    id: "message-control-id",
    sequence: 5,
    section: "sender",
    targetPath: "message.controlId",
    label: "Message control ID",
    sources: [source("MSH", 10)],
    required: true,
  }),
  item({
    id: "message-processing-id",
    sequence: 6,
    section: "sender",
    targetPath: "message.processingId",
    label: "Message processing ID",
    sources: [source("MSH", 11, 1)],
    required: true,
  }),
  item({
    id: "message-version",
    sequence: 7,
    section: "sender",
    targetPath: "message.version",
    label: "HL7 version",
    action: "validate",
    sources: [source("MSH", 12, 1)],
    required: true,
    transformName: "mustEqual",
    transformParams: { expected: "2.5.1" },
  }),
  item({
    id: "sender-application",
    sequence: 8,
    section: "sender",
    targetPath: "sender.application.namespaceId",
    label: "Sending application",
    sources: [source("MSH", 3, 1)],
    required: true,
  }),
  item({
    id: "sender-facility",
    sequence: 9,
    section: "sender",
    targetPath: "sender.facility.namespaceId",
    label: "Sending facility",
    sources: [source("MSH", 4, 1)],
    required: true,
  }),
  item({
    id: "receiving-application",
    sequence: 10,
    section: "sender",
    targetPath: "sender.receivingApplication.namespaceId",
    label: "Receiving application",
    sources: [source("MSH", 5, 1)],
  }),
  item({
    id: "receiving-facility",
    sequence: 11,
    section: "sender",
    targetPath: "sender.receivingFacility.namespaceId",
    label: "Receiving facility",
    sources: [source("MSH", 6, 1)],
  }),

  item({
    id: "patient-identifier-mrn",
    sequence: 20,
    section: "patient",
    targetPath: "patient.identifiers[0]",
    label: "Patient MRN",
    valueType: "identifier",
    sources: [source("PID", 3)],
    required: true,
    transformName: "preferIdentifierType",
    transformDescription:
      "Prefer the PID-3 repetition with identifier type MR; otherwise use the first non-empty PID-3 repetition.",
    transformParams: { preferredType: "MR" },
  }),
  item({
    id: "patient-name",
    sequence: 21,
    section: "patient",
    targetPath: "patient.name",
    label: "Patient name",
    valueType: "person_name",
    sources: [
      source("PID", 5, 1),
      source("PID", 5, 2),
      source("PID", 5, 3),
      source("PID", 5, 4),
      source("PID", 5, 5),
    ],
    required: true,
    transformName: "mapXpnName",
    transformParams: {
      sourceRoles: [
        { path: "PID-5.1", segmentIndex: null, role: "family" },
        { path: "PID-5.2", segmentIndex: null, role: "given" },
        { path: "PID-5.3", segmentIndex: null, role: "middle" },
        { path: "PID-5.4", segmentIndex: null, role: "suffix" },
        { path: "PID-5.5", segmentIndex: null, role: "prefix" },
      ],
    },
  }),
  item({
    id: "patient-date-of-birth",
    sequence: 22,
    section: "patient",
    targetPath: "patient.dateOfBirth",
    label: "Patient date of birth",
    action: "normalize_date",
    valueType: "date",
    sources: [source("PID", 7, 1)],
    required: true,
  }),
  item({
    id: "patient-administrative-sex",
    sequence: 23,
    section: "patient",
    targetPath: "patient.administrativeSex",
    label: "Patient administrative sex",
    sources: [source("PID", 8)],
  }),
  item({
    id: "patient-addresses",
    sequence: 24,
    section: "patient",
    targetPath: "patient.addresses",
    label: "Patient addresses",
    action: "compose",
    valueType: "array",
    sources: [
      source("PID", 11, 1, 1),
      source("PID", 11, 3),
      source("PID", 11, 4),
      source("PID", 11, 5),
      source("PID", 11, 6),
    ],
    transformName: "mapRepeatingXadAddresses",
  }),
  item({
    id: "patient-telecom",
    sequence: 25,
    section: "patient",
    targetPath: "patient.telecom",
    label: "Patient phone numbers",
    action: "compose",
    valueType: "array",
    sources: [
      source("PID", 13, 2),
      source("PID", 13, 3),
      source("PID", 13, 5),
      source("PID", 13, 6),
      source("PID", 13, 7),
    ],
    transformName: "mapRepeatingXtnTelecom",
  }),

  item({
    id: "coverage-records",
    sequence: 40,
    section: "coverage",
    targetPath: "coverages",
    label: "Coverage records",
    action: "compose",
    valueType: "array",
    sources: [
      source("IN1", 1),
      source("IN1", 2),
      source("IN1", 3),
      source("IN1", 4),
      source("IN1", 8),
      source("IN1", 16),
      source("IN1", 17),
      source("IN1", 36),
    ],
    transformName: "mapRepeatingIn1Coverage",
    required: false,
  }),

  item({
    id: "guarantor-record",
    sequence: 60,
    section: "guarantor",
    targetPath: "guarantor",
    label: "Guarantor",
    action: "compose",
    valueType: "object",
    sources: [
      source("GT1", 2),
      source("GT1", 3),
      source("GT1", 5),
      source("GT1", 6),
      source("GT1", 8),
      source("GT1", 9),
      source("GT1", 10),
      source("GT1", 11),
    ],
    transformName: "mapOptionalGt1Guarantor",
    required: false,
  }),

  item({
    id: "lab-order-groups",
    sequence: 80,
    section: "labOrders",
    targetPath: "labOrders",
    label: "Laboratory orders",
    action: "compose",
    valueType: "array",
    sources: [
      source("ORC", 1),
      source("ORC", 2),
      source("ORC", 3),
      source("ORC", 5),
      source("ORC", 9),
      source("ORC", 12),
      source("TQ1", 7),
      source("TQ1", 8),
      source("TQ1", 9),
      source("OBR", 2),
      source("OBR", 3),
      source("OBR", 4),
      source("OBR", 16),
      source("SPM", 1),
      source("SPM", 2),
      source("SPM", 4),
      source("SPM", 11),
      source("SPM", 17),
      source("SPM", 18),
      source("SPM", 27),
    ],
    required: true,
    transformName: "mapOrcOrderGroups",
    transformDescription:
      "Each ORC starts one lab order. TQ1, OBR, and SPM are associated with the current ORC until the next ORC.",
  }),
] as const satisfies readonly Hl7Item[]

export const defaultOmlO21ClientProfile = ClientProfileSchema.parse({
  clientId: DEFAULT_CLIENT_ID,
  profileId: "default-oml-o21-v251",
  profileVersion: 1,
  status: "published",
  displayName: "Default OML^O21 laboratory order profile",
  description:
    "Built-in synthetic-data profile for HL7 v2.5.1 OML^O21 laboratory order onboarding.",
  hl7Version: "2.5.1",
  messageType: "OML^O21",
  messageStructure: "OML_O21",
  createdAt: DEFAULT_PROFILE_TIMESTAMP,
  updatedAt: DEFAULT_PROFILE_TIMESTAMP,
  publishedAt: DEFAULT_PROFILE_TIMESTAMP,
  itemSet: {
    clientId: DEFAULT_CLIENT_ID,
    messageType: "OML^O21",
    hl7Version: "2.5.1",
    items: defaultOmlO21Items,
  },
}) satisfies ClientProfile
