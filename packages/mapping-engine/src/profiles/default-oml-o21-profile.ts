import {
  ClientProfileSchema,
  createSourceReference,
  type ClientProfile,
  type Hl7Item,
  type Hl7ItemAction,
  type Hl7ItemValueType,
  type NormalizedOutputSection,
  type SourceExpectation,
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
  sourceExpectations?: SourceExpectation[]
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
  sourceExpectations = [],
  notes,
  ...input
}: DefaultProfileItemInput): Hl7Item {
  return {
    ...input,
    clientId: DEFAULT_CLIENT_ID,
    action,
    valueType,
    sources,
    sourceExpectations,
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

function expectation({
  path,
  expectedLabel,
  requiredness,
  examples = [],
  emptyMeaning,
  guidance,
}: SourceExpectation): SourceExpectation {
  return {
    path,
    expectedLabel,
    requiredness,
    examples,
    emptyMeaning,
    guidance,
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
    sourceExpectations: [
      expectation({
        path: "MSH-7.1",
        expectedLabel: "Message sent timestamp",
        requiredness: "required",
        examples: ["20260706101500-0700"],
        emptyMeaning: "The message did not include a sent timestamp.",
        guidance:
          "Confirm the sending system populates MSH-7 for audit and report traceability.",
      }),
    ],
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
    sourceExpectations: [
      expectation({
        path: "MSH-9.1",
        expectedLabel: "HL7 message code",
        requiredness: "required",
        examples: ["OML"],
        emptyMeaning: "The message type code was not present.",
        guidance: "This MVP expects OML messages only.",
      }),
    ],
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
    sourceExpectations: [
      expectation({
        path: "MSH-9.2",
        expectedLabel: "HL7 trigger event",
        requiredness: "required",
        examples: ["O21"],
        emptyMeaning: "The trigger event was not present.",
        guidance: "This MVP expects OML^O21 laboratory order messages.",
      }),
    ],
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
    sourceExpectations: [
      expectation({
        path: "MSH-9.3",
        expectedLabel: "HL7 message structure",
        requiredness: "required",
        examples: ["OML_O21"],
        emptyMeaning: "The message structure was not present.",
        guidance:
          "Confirm the sender includes OML_O21 in MSH-9.3 for this default profile.",
      }),
    ],
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
    sourceExpectations: [
      expectation({
        path: "MSH-10",
        expectedLabel: "Message control ID",
        requiredness: "required",
        examples: ["MSG-20260706-0001"],
        emptyMeaning: "The message did not include a control ID.",
        guidance:
          "Control IDs help reconcile messages during onboarding and support.",
      }),
    ],
    required: true,
  }),
  item({
    id: "message-processing-id",
    sequence: 6,
    section: "sender",
    targetPath: "message.processingId",
    label: "Message processing ID",
    sources: [source("MSH", 11, 1)],
    sourceExpectations: [
      expectation({
        path: "MSH-11.1",
        expectedLabel: "Processing ID",
        requiredness: "required",
        examples: ["P", "T"],
        emptyMeaning: "The message did not include a processing ID.",
        guidance:
          "Processing ID helps identify production versus test traffic.",
      }),
    ],
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
    sourceExpectations: [
      expectation({
        path: "MSH-12.1",
        expectedLabel: "HL7 version",
        requiredness: "required",
        examples: ["2.5.1"],
        emptyMeaning: "The message did not include an HL7 version.",
        guidance: "This MVP only supports HL7 v2.5.1 initially.",
      }),
    ],
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
    sourceExpectations: [
      expectation({
        path: "MSH-3.1",
        expectedLabel: "Sending application namespace",
        requiredness: "required",
        examples: ["NORTHSTAR_LIS"],
        emptyMeaning: "The sending application was not present.",
        guidance: "This identifies the system that produced the HL7 message.",
      }),
    ],
    required: true,
  }),
  item({
    id: "sender-facility",
    sequence: 9,
    section: "sender",
    targetPath: "sender.facility.namespaceId",
    label: "Sending facility",
    sources: [source("MSH", 4, 1)],
    sourceExpectations: [
      expectation({
        path: "MSH-4.1",
        expectedLabel: "Sending facility namespace",
        requiredness: "required",
        examples: ["NORTHSTAR_LAB"],
        emptyMeaning: "The sending facility was not present.",
        guidance:
          "This identifies the client/facility associated with the feed.",
      }),
    ],
    required: true,
  }),
  item({
    id: "receiving-application",
    sequence: 10,
    section: "sender",
    targetPath: "sender.receivingApplication.namespaceId",
    label: "Receiving application",
    sources: [source("MSH", 5, 1)],
    sourceExpectations: [
      expectation({
        path: "MSH-5.1",
        expectedLabel: "Receiving application namespace",
        requiredness: "recommended",
        examples: ["HL7_MAPPER"],
        emptyMeaning: "The receiving application was not present.",
        guidance:
          "Helpful for routing and onboarding evidence, but not always populated in samples.",
      }),
    ],
  }),
  item({
    id: "receiving-facility",
    sequence: 11,
    section: "sender",
    targetPath: "sender.receivingFacility.namespaceId",
    label: "Receiving facility",
    sources: [source("MSH", 6, 1)],
    sourceExpectations: [
      expectation({
        path: "MSH-6.1",
        expectedLabel: "Receiving facility namespace",
        requiredness: "recommended",
        examples: ["DEMO_FACILITY"],
        emptyMeaning: "The receiving facility was not present.",
        guidance:
          "Helpful for routing and onboarding evidence, but not always populated in samples.",
      }),
    ],
  }),

  item({
    id: "patient-identifier-mrn",
    sequence: 20,
    section: "patient",
    targetPath: "patient.identifiers[0]",
    label: "Patient MRN",
    valueType: "identifier",
    sources: [source("PID", 3)],
    sourceExpectations: [
      expectation({
        path: "PID-3",
        expectedLabel: "Patient identifier list",
        requiredness: "required",
        examples: ["MRN-104892^^^NORTHSTAR_LAB^MR"],
        emptyMeaning: "No patient identifier was present in PID-3.",
        guidance:
          "The default mapping prefers a PID-3 repetition with identifier type MR.",
      }),
    ],
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
    sourceExpectations: [
      expectation({
        path: "PID-5.1",
        expectedLabel: "Patient family name",
        requiredness: "required",
        examples: ["Lopez"],
        emptyMeaning: "No family or last name was present in PID-5.1.",
        guidance:
          "Review with the client if this is blank; this is usually needed to identify the patient.",
      }),
      expectation({
        path: "PID-5.2",
        expectedLabel: "Patient given name",
        requiredness: "required",
        examples: ["Elena"],
        emptyMeaning: "No given or first name was present in PID-5.2.",
        guidance:
          "Review with the client if this is blank; this is usually needed to identify the patient.",
      }),
      expectation({
        path: "PID-5.3",
        expectedLabel: "Patient middle name or initial",
        requiredness: "optional",
        examples: ["M"],
        emptyMeaning: "No middle name or initial was present in PID-5.3.",
        guidance:
          "Usually safe to ignore unless this client relies on middle names for matching.",
      }),
      expectation({
        path: "PID-5.4",
        expectedLabel: "Patient name suffix",
        requiredness: "optional",
        examples: ["Jr", "Sr", "III"],
        emptyMeaning: "No suffix was present in PID-5.4.",
        guidance: "Usually safe to ignore unless this client sends suffixes.",
      }),
      expectation({
        path: "PID-5.5",
        expectedLabel: "Patient name prefix",
        requiredness: "optional",
        examples: ["Dr", "Mr", "Ms"],
        emptyMeaning: "No prefix was present in PID-5.5.",
        guidance:
          "Usually safe to ignore unless this client sends titles or prefixes.",
      }),
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
    sourceExpectations: [
      expectation({
        path: "PID-7.1",
        expectedLabel: "Patient date of birth",
        requiredness: "required",
        examples: ["19870514"],
        emptyMeaning: "No patient date of birth was present in PID-7.",
        guidance:
          "Review if blank; date of birth is often needed for patient matching.",
      }),
    ],
    required: true,
  }),
  item({
    id: "patient-administrative-sex",
    sequence: 23,
    section: "patient",
    targetPath: "patient.administrativeSex",
    label: "Patient administrative sex",
    sources: [source("PID", 8)],
    sourceExpectations: [
      expectation({
        path: "PID-8",
        expectedLabel: "Patient administrative sex",
        requiredness: "recommended",
        examples: ["F", "M", "O", "U"],
        emptyMeaning: "No administrative sex value was present in PID-8.",
        guidance:
          "Review with the client if this field is expected for ordering or downstream matching.",
      }),
    ],
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
    sourceExpectations: [
      expectation({
        path: "PID-11.1.1",
        expectedLabel: "Patient street address",
        requiredness: "recommended",
        examples: ["742 Evergreen Ave"],
        emptyMeaning: "No street address was present in PID-11.1.",
        guidance:
          "Review if the client expects addresses for patient matching or billing context.",
      }),
      expectation({
        path: "PID-11.3",
        expectedLabel: "Patient city",
        requiredness: "recommended",
        examples: ["Los Angeles"],
        emptyMeaning: "No city was present in PID-11.3.",
        guidance:
          "Review if addresses are part of the client onboarding scope.",
      }),
      expectation({
        path: "PID-11.4",
        expectedLabel: "Patient state",
        requiredness: "recommended",
        examples: ["CA"],
        emptyMeaning: "No state was present in PID-11.4.",
        guidance:
          "Review if addresses are part of the client onboarding scope.",
      }),
      expectation({
        path: "PID-11.5",
        expectedLabel: "Patient postal code",
        requiredness: "recommended",
        examples: ["90017"],
        emptyMeaning: "No postal code was present in PID-11.5.",
        guidance:
          "Review if addresses are part of the client onboarding scope.",
      }),
      expectation({
        path: "PID-11.6",
        expectedLabel: "Patient country",
        requiredness: "optional",
        examples: ["USA"],
        emptyMeaning: "No country was present in PID-11.6.",
        guidance:
          "Usually safe to ignore for domestic feeds unless the client sends international addresses.",
      }),
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
    sourceExpectations: [
      expectation({
        path: "PID-13.2",
        expectedLabel: "Patient phone use",
        requiredness: "recommended",
        examples: ["PRN"],
        emptyMeaning: "No phone use code was present in PID-13.2.",
        guidance:
          "Review if the client differentiates home, work, or mobile phone numbers.",
      }),
      expectation({
        path: "PID-13.3",
        expectedLabel: "Patient phone equipment type",
        requiredness: "recommended",
        examples: ["PH", "CP"],
        emptyMeaning: "No phone equipment type was present in PID-13.3.",
        guidance:
          "Review if the client distinguishes phone, mobile, or email contact values.",
      }),
      expectation({
        path: "PID-13.5",
        expectedLabel: "Patient phone country code",
        requiredness: "optional",
        examples: ["1"],
        emptyMeaning: "No phone country code was present in PID-13.5.",
        guidance:
          "Usually safe to ignore for domestic feeds when area code and local number are present.",
      }),
      expectation({
        path: "PID-13.6",
        expectedLabel: "Patient phone area code",
        requiredness: "recommended",
        examples: ["213"],
        emptyMeaning: "No phone area code was present in PID-13.6.",
        guidance:
          "Review if phone numbers are in scope for the client handoff.",
      }),
      expectation({
        path: "PID-13.7",
        expectedLabel: "Patient phone local number",
        requiredness: "recommended",
        examples: ["5550142"],
        emptyMeaning: "No local phone number was present in PID-13.7.",
        guidance:
          "Review if phone numbers are in scope for the client handoff.",
      }),
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
    sourceExpectations: [
      expectation({
        path: "IN1-1",
        expectedLabel: "Coverage set ID",
        requiredness: "conditional",
        examples: ["1"],
        emptyMeaning: "No IN1 set ID was present.",
        guidance: "Review when an IN1 segment is expected for the client feed.",
      }),
      expectation({
        path: "IN1-2",
        expectedLabel: "Insurance plan identifier",
        requiredness: "conditional",
        examples: ["PPO-42^Preferred Provider Plan^99DEMO"],
        emptyMeaning: "No plan identifier was present in IN1-2.",
        guidance:
          "Review if coverage extraction is part of this client onboarding.",
      }),
      expectation({
        path: "IN1-3",
        expectedLabel: "Insurer identifier",
        requiredness: "conditional",
        examples: ["ACME-001^^^ACME^NI"],
        emptyMeaning: "No insurer identifier was present in IN1-3.",
        guidance:
          "Review if payer identity is needed for this client's mapping.",
      }),
      expectation({
        path: "IN1-4",
        expectedLabel: "Insurer name",
        requiredness: "conditional",
        examples: ["Acme Health Plan"],
        emptyMeaning: "No insurer name was present in IN1-4.",
        guidance: "Review if payer display names are needed for handoff.",
      }),
      expectation({
        path: "IN1-8",
        expectedLabel: "Coverage group number",
        requiredness: "conditional",
        examples: ["GRP-7781"],
        emptyMeaning: "No group number was present in IN1-8.",
        guidance:
          "Review if the client expects group numbers for coverage matching.",
      }),
      expectation({
        path: "IN1-16",
        expectedLabel: "Subscriber name",
        requiredness: "conditional",
        examples: ["Lopez^Elena^M"],
        emptyMeaning: "No subscriber name was present in IN1-16.",
        guidance: "Review if coverage/subscriber extraction is in scope.",
      }),
      expectation({
        path: "IN1-17",
        expectedLabel: "Subscriber relationship",
        requiredness: "conditional",
        examples: ["SEL^Self^HL70063"],
        emptyMeaning: "No subscriber relationship was present in IN1-17.",
        guidance: "Review if relationship is needed for coverage handoff.",
      }),
      expectation({
        path: "IN1-36",
        expectedLabel: "Coverage policy number",
        requiredness: "conditional",
        examples: ["POL-558903"],
        emptyMeaning: "No policy number was present in IN1-36.",
        guidance:
          "Review if policy/member identifiers are required for this client.",
      }),
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
    sourceExpectations: [
      expectation({
        path: "GT1-2",
        expectedLabel: "Guarantor identifier",
        requiredness: "conditional",
        examples: ["GT-104892^^^NORTHSTAR_LAB^GU"],
        emptyMeaning: "No guarantor identifier was present in GT1-2.",
        guidance: "Review if guarantor extraction is in scope for this client.",
      }),
      expectation({
        path: "GT1-3",
        expectedLabel: "Guarantor name",
        requiredness: "conditional",
        examples: ["Lopez^Elena^M"],
        emptyMeaning: "No guarantor name was present in GT1-3.",
        guidance: "Review if guarantor extraction is in scope for this client.",
      }),
      expectation({
        path: "GT1-5",
        expectedLabel: "Guarantor address",
        requiredness: "conditional",
        examples: ["742 Evergreen Ave^^Los Angeles^CA^90017^USA"],
        emptyMeaning: "No guarantor address was present in GT1-5.",
        guidance: "Review if guarantor demographics are needed for handoff.",
      }),
      expectation({
        path: "GT1-6",
        expectedLabel: "Guarantor phone",
        requiredness: "conditional",
        examples: ["^PRN^PH^^^213^5550142"],
        emptyMeaning: "No guarantor phone was present in GT1-6.",
        guidance: "Review if guarantor contact details are needed.",
      }),
      expectation({
        path: "GT1-8",
        expectedLabel: "Guarantor date of birth",
        requiredness: "conditional",
        examples: ["19870514"],
        emptyMeaning: "No guarantor date of birth was present in GT1-8.",
        guidance: "Review if guarantor identity matching is needed.",
      }),
      expectation({
        path: "GT1-9",
        expectedLabel: "Guarantor administrative sex",
        requiredness: "optional",
        examples: ["F"],
        emptyMeaning: "No guarantor administrative sex was present in GT1-9.",
        guidance:
          "Usually safe to ignore unless the client specifically requires it.",
      }),
      expectation({
        path: "GT1-10",
        expectedLabel: "Guarantor type",
        requiredness: "optional",
        examples: ["P"],
        emptyMeaning: "No guarantor type was present in GT1-10.",
        guidance:
          "Usually safe to ignore unless the client uses guarantor type.",
      }),
      expectation({
        path: "GT1-11",
        expectedLabel: "Guarantor relationship",
        requiredness: "conditional",
        examples: ["SEL^Self^HL70063"],
        emptyMeaning: "No guarantor relationship was present in GT1-11.",
        guidance: "Review if relationship is needed for guarantor handoff.",
      }),
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
    sourceExpectations: [
      expectation({
        path: "ORC-1",
        expectedLabel: "Order control code",
        requiredness: "required",
        examples: ["NW"],
        emptyMeaning: "No order control code was present in ORC-1.",
        guidance:
          "Review if blank; it describes the order action being requested.",
      }),
      expectation({
        path: "ORC-2",
        expectedLabel: "Placer order number",
        requiredness: "required",
        examples: ["ORD-90017^NORTHSTAR_LIS"],
        emptyMeaning: "No placer order number was present in ORC-2.",
        guidance:
          "Review if blank; order identifiers are core to lab-order handoff.",
      }),
      expectation({
        path: "ORC-3",
        expectedLabel: "Filler order number",
        requiredness: "recommended",
        examples: ["FILL-41220^NORTHSTAR_LAB"],
        emptyMeaning: "No filler order number was present in ORC-3.",
        guidance:
          "Review if the receiving workflow expects filler-side identifiers.",
      }),
      expectation({
        path: "ORC-5",
        expectedLabel: "Order status",
        requiredness: "recommended",
        examples: ["SC"],
        emptyMeaning: "No order status was present in ORC-5.",
        guidance: "Review if status is required for downstream order routing.",
      }),
      expectation({
        path: "ORC-9",
        expectedLabel: "Order transaction timestamp",
        requiredness: "recommended",
        examples: ["20260706101000-0700"],
        emptyMeaning: "No order transaction timestamp was present in ORC-9.",
        guidance: "Review if order timing is important for client handoff.",
      }),
      expectation({
        path: "ORC-12",
        expectedLabel: "Ordering provider",
        requiredness: "recommended",
        examples: ["12345^Patel^Anika^^^^MD"],
        emptyMeaning: "No ordering provider was present in ORC-12.",
        guidance:
          "Review if provider attribution is required for the client workflow.",
      }),
      expectation({
        path: "TQ1-7",
        expectedLabel: "Requested start time",
        requiredness: "recommended",
        examples: ["20260706103000-0700"],
        emptyMeaning: "No requested start time was present in TQ1-7.",
        guidance:
          "Review if timing is required for scheduling or prioritization.",
      }),
      expectation({
        path: "TQ1-8",
        expectedLabel: "Requested end time",
        requiredness: "optional",
        examples: ["20260706104500-0700"],
        emptyMeaning: "No requested end time was present in TQ1-8.",
        guidance:
          "Usually safe to ignore for point-in-time lab orders unless the client sends time windows.",
      }),
      expectation({
        path: "TQ1-9",
        expectedLabel: "Order priority",
        requiredness: "recommended",
        examples: ["R^Routine^HL70485"],
        emptyMeaning: "No priority was present in TQ1-9.",
        guidance:
          "Review if priority affects routing or service-level expectations.",
      }),
      expectation({
        path: "OBR-2",
        expectedLabel: "OBR placer order number",
        requiredness: "recommended",
        examples: ["ORD-90017^NORTHSTAR_LIS"],
        emptyMeaning: "No OBR placer order number was present in OBR-2.",
        guidance:
          "Review if ORC-2 is missing or the client expects OBR-level identifiers.",
      }),
      expectation({
        path: "OBR-3",
        expectedLabel: "OBR filler order number",
        requiredness: "recommended",
        examples: ["FILL-41220^NORTHSTAR_LAB"],
        emptyMeaning: "No OBR filler order number was present in OBR-3.",
        guidance:
          "Review if filler-side identifiers are needed in the handoff.",
      }),
      expectation({
        path: "OBR-4",
        expectedLabel: "Ordered lab service",
        requiredness: "required",
        examples: ["57021-8^CBC W Auto Differential panel^LN"],
        emptyMeaning: "No ordered lab service was present in OBR-4.",
        guidance:
          "Review if blank; this identifies the lab test/order being requested.",
      }),
      expectation({
        path: "OBR-16",
        expectedLabel: "OBR ordering provider",
        requiredness: "recommended",
        examples: ["12345^Patel^Anika^^^^MD"],
        emptyMeaning: "No OBR ordering provider was present in OBR-16.",
        guidance:
          "Review if ORC-12 is missing or provider attribution is required.",
      }),
      expectation({
        path: "SPM-1",
        expectedLabel: "Specimen set ID",
        requiredness: "recommended",
        examples: ["1"],
        emptyMeaning: "No specimen set ID was present in SPM-1.",
        guidance:
          "Review if specimen grouping is important for multi-specimen orders.",
      }),
      expectation({
        path: "SPM-2",
        expectedLabel: "Specimen identifiers",
        requiredness: "recommended",
        examples: ["SPM-90017&NORTHSTAR_LIS^SPM-41220&NORTHSTAR_LAB"],
        emptyMeaning: "No specimen identifiers were present in SPM-2.",
        guidance: "Review if specimen tracking is in scope for this client.",
      }),
      expectation({
        path: "SPM-4",
        expectedLabel: "Specimen type",
        requiredness: "recommended",
        examples: ["BLD^Whole blood^HL70487"],
        emptyMeaning: "No specimen type was present in SPM-4.",
        guidance:
          "Review if specimen details are needed for lab-order handoff.",
      }),
      expectation({
        path: "SPM-11",
        expectedLabel: "Specimen role",
        requiredness: "optional",
        examples: ["P^Patient specimen^HL70369"],
        emptyMeaning: "No specimen role was present in SPM-11.",
        guidance:
          "Usually safe to ignore unless the client distinguishes specimen roles.",
      }),
      expectation({
        path: "SPM-17",
        expectedLabel: "Specimen collection time",
        requiredness: "recommended",
        examples: ["20260706100000-0700^20260706100500-0700"],
        emptyMeaning: "No specimen collection time was present in SPM-17.",
        guidance:
          "Review if collection timing is required for the client workflow.",
      }),
      expectation({
        path: "SPM-18",
        expectedLabel: "Specimen received time",
        requiredness: "recommended",
        examples: ["20260706102000-0700"],
        emptyMeaning: "No specimen received time was present in SPM-18.",
        guidance:
          "Review if receipt timing is needed for lab operations reporting.",
      }),
      expectation({
        path: "SPM-27",
        expectedLabel: "Specimen container type",
        requiredness: "optional",
        examples: ["TUBE^Collection tube^99DEMO"],
        emptyMeaning: "No container type was present in SPM-27.",
        guidance:
          "Usually safe to ignore unless the client needs container details.",
      }),
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
