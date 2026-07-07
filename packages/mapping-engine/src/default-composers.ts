import type {
  CodedValue,
  Coverage,
  Guarantor,
  LabOrder,
  MessageMetadata,
  NormalizedOutput,
  Patient,
  PersonName,
  Provider,
  Sender,
  Specimen,
  Telecom,
} from "@hl7-data-mapper/contracts"
import { NORMALIZED_OUTPUT_SCHEMA_VERSION } from "@hl7-data-mapper/contracts"
import type {
  Hl7Field,
  Hl7Repetition,
  Hl7Segment,
  ParsedHl7Message,
} from "@hl7-data-mapper/hl7-parser"

import {
  chooseIdentifier,
  componentValue,
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
} from "./hl7-value-helpers.js"

export function composeDefaultNormalizedOutput(
  parsedMessage: ParsedHl7Message,
): NormalizedOutput {
  return {
    schemaVersion: NORMALIZED_OUTPUT_SCHEMA_VERSION,
    message: composeMessageMetadata(parsedMessage),
    sender: composeSender(parsedMessage),
    patient: composePatient(parsedMessage),
    coverages: composeCoverages(parsedMessage),
    guarantor: composeGuarantor(parsedMessage),
    labOrders: composeLabOrders(parsedMessage),
  }
}

export function composeMessageMetadata(
  parsedMessage: ParsedHl7Message,
): MessageMetadata {
  const msh = getFirstSegment(parsedMessage, "MSH")
  const messageType = firstRepetition(getField(msh, 9))

  return {
    type: componentValue(messageType, 1) === "OML" ? "OML" : "OML",
    triggerEvent: componentValue(messageType, 2) === "O21" ? "O21" : "O21",
    structure:
      componentValue(messageType, 3) === "OML_O21" ? "OML_O21" : "OML_O21",
    controlId: fieldValue(msh, 10),
    processingId: componentValue(firstRepetition(getField(msh, 11)), 1),
    version: fieldValue(msh, 12) === "2.5.1" ? "2.5.1" : "2.5.1",
    sentAt: normalizeHl7Timestamp(
      componentValue(firstRepetition(getField(msh, 7)), 1),
    ),
  }
}

export function composeSender(parsedMessage: ParsedHl7Message): Sender {
  const msh = getFirstSegment(parsedMessage, "MSH")

  return {
    application: {
      namespaceId: componentValue(firstRepetition(getField(msh, 3)), 1),
    },
    facility: {
      namespaceId: componentValue(firstRepetition(getField(msh, 4)), 1),
    },
    receivingApplication: {
      namespaceId: componentValue(firstRepetition(getField(msh, 5)), 1),
    },
    receivingFacility: {
      namespaceId: componentValue(firstRepetition(getField(msh, 6)), 1),
    },
  }
}

export function composePatient(parsedMessage: ParsedHl7Message): Patient {
  const pid = getFirstSegment(parsedMessage, "PID")
  const identifier = chooseIdentifier(getField(pid, 3), "MR")

  return {
    identifiers: identifier ? [identifier] : [],
    name: mapPersonName(firstRepetition(getField(pid, 5))),
    dateOfBirth: normalizeHl7Date(
      componentValue(firstRepetition(getField(pid, 7)), 1),
    ),
    administrativeSex: fieldValue(pid, 8),
    addresses: getField(pid, 11)?.repetitions.map(mapAddress) ?? [],
    telecom: getField(pid, 13)?.repetitions.map(mapTelecom) ?? [],
  }
}

export function composeCoverages(parsedMessage: ParsedHl7Message): Coverage[] {
  return getSegments(parsedMessage, "IN1").map((in1) => {
    const sequence = parseInteger(fieldValue(in1, 1)) ?? 1
    const plan = mapCodedValue(firstRepetition(getField(in1, 2))) ?? {
      code: "",
      display: null,
      system: null,
    }
    const subscriberName = mapCompactPersonName(
      firstRepetition(getField(in1, 16)),
    )

    return {
      sequence,
      plan,
      insurer: {
        id: componentValue(firstRepetition(getField(in1, 3)), 1),
        name: componentValue(firstRepetition(getField(in1, 4)), 1),
      },
      groupNumber: fieldValue(in1, 8),
      policyNumber: fieldValue(in1, 36),
      subscriber: {
        name: subscriberName,
        relationship: mapCodedValueWithoutSystem(
          firstRepetition(getField(in1, 17)),
        ),
      },
    }
  })
}

export function composeGuarantor(
  parsedMessage: ParsedHl7Message,
): Guarantor | null {
  const gt1 = getFirstSegment(parsedMessage, "GT1")

  if (!gt1) {
    return null
  }

  return {
    identifier: mapIdentifier(firstRepetition(getField(gt1, 2))),
    name: mapCompactPersonName(firstRepetition(getField(gt1, 3))),
    address: mapAddress(firstRepetition(getField(gt1, 5))),
    telecom: mapCompactTelecom(firstRepetition(getField(gt1, 6))),
    dateOfBirth: normalizeHl7Date(
      componentValue(firstRepetition(getField(gt1, 8)), 1),
    ),
    administrativeSex: fieldValue(gt1, 9),
    type: fieldValue(gt1, 10),
    relationship: mapCodedValueWithoutSystem(
      firstRepetition(getField(gt1, 11)),
    ),
  }
}

export function composeLabOrders(parsedMessage: ParsedHl7Message): LabOrder[] {
  return getOrderGroups(parsedMessage).map((group) => {
    const obr = group.segments.find((segment) => segment.name === "OBR")
    const tq1 = group.segments.find((segment) => segment.name === "TQ1")

    return {
      controlCode: fieldValue(group.orc, 1),
      placerOrderNumber:
        mapEntityIdentifier(firstRepetition(getField(obr, 2))) ??
        mapEntityIdentifier(firstRepetition(getField(group.orc, 2))),
      fillerOrderNumber:
        mapEntityIdentifier(firstRepetition(getField(obr, 3))) ??
        mapEntityIdentifier(firstRepetition(getField(group.orc, 3))),
      status: fieldValue(group.orc, 5),
      transactionAt: normalizeHl7Timestamp(
        componentValue(firstRepetition(getField(group.orc, 9)), 1),
      ),
      orderingProvider:
        mapNullableProvider(firstRepetition(getField(group.orc, 12))) ??
        mapNullableProvider(firstRepetition(getField(obr, 16))),
      timing: {
        startAt: normalizeHl7Timestamp(
          componentValue(firstRepetition(getField(tq1, 7)), 1),
        ),
        endAt: normalizeHl7Timestamp(
          componentValue(firstRepetition(getField(tq1, 8)), 1),
        ),
        priority: mapCodedValueWithoutSystem(firstRepetition(getField(tq1, 9))),
      },
      service: mapCodedValue(firstRepetition(getField(obr, 4))) ?? {
        code: "",
        display: null,
        system: null,
      },
      specimens: composeSpecimens(group.segments),
    }
  })
}

export function composeSpecimens(
  orderGroupSegments: readonly Hl7Segment[],
): Specimen[] {
  return orderGroupSegments
    .filter((segment) => segment.name === "SPM")
    .map((spm) => {
      const specimenId = firstRepetition(getField(spm, 2))
      const collected = firstRepetition(getField(spm, 17))

      return {
        sequence: parseInteger(fieldValue(spm, 1)) ?? 1,
        placerId: mapEntityIdentifierFromComponent(specimenId?.components[0]),
        fillerId: mapEntityIdentifierFromComponent(specimenId?.components[1]),
        type: mapCodedValue(firstRepetition(getField(spm, 4))),
        role: mapCodedValueWithoutSystem(firstRepetition(getField(spm, 11))),
        collected: {
          startAt: normalizeHl7Timestamp(componentValue(collected, 1)),
          endAt: normalizeHl7Timestamp(componentValue(collected, 2)),
        },
        receivedAt: normalizeHl7Timestamp(
          componentValue(firstRepetition(getField(spm, 18)), 1),
        ),
        containerType: mapCodedValue(firstRepetition(getField(spm, 27))),
      }
    })
}

function getFirstSegment(
  parsedMessage: ParsedHl7Message,
  segmentName: string,
): Hl7Segment | undefined {
  return parsedMessage.segments.find((segment) => segment.name === segmentName)
}

function getSegments(
  parsedMessage: ParsedHl7Message,
  segmentName: string,
): Hl7Segment[] {
  return parsedMessage.segments.filter(
    (segment) => segment.name === segmentName,
  )
}

function getOrderGroups(
  parsedMessage: ParsedHl7Message,
): { orc: Hl7Segment; segments: readonly Hl7Segment[] }[] {
  return parsedMessage.segments.flatMap((segment, index) => {
    if (segment.name !== "ORC") {
      return []
    }

    const nextOrcIndex = parsedMessage.segments.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index && candidate.name === "ORC",
    )
    const groupEndIndex =
      nextOrcIndex === -1 ? parsedMessage.segments.length : nextOrcIndex

    return [
      {
        orc: segment,
        segments: parsedMessage.segments.slice(index, groupEndIndex),
      },
    ]
  })
}

function getField(
  segment: Hl7Segment | undefined,
  fieldIndex: number,
): Hl7Field | undefined {
  return segment?.fields.find((field) => field.index === fieldIndex)
}

function fieldValue(
  segment: Hl7Segment | undefined,
  fieldIndex: number,
): string | null {
  return getField(segment, fieldIndex)?.raw.trim() || null
}

function mapCodedValueWithoutSystem(
  repetition: Hl7Repetition | undefined,
): CodedValue | null {
  const codedValue = mapCodedValue(repetition)

  if (!codedValue) {
    return null
  }

  return {
    code: codedValue.code,
    display: codedValue.display,
  }
}

function mapCompactPersonName(
  repetition: Hl7Repetition | undefined,
): PersonName {
  const name = mapPersonName(repetition)

  return {
    family: name.family,
    given: name.given,
    middle: name.middle,
  }
}

function mapCompactTelecom(repetition: Hl7Repetition | undefined): Telecom {
  const telecom = mapTelecom(repetition)

  return {
    use: telecom.use,
    equipmentType: telecom.equipmentType,
    areaCode: telecom.areaCode,
    localNumber: telecom.localNumber,
  }
}

function mapNullableProvider(
  repetition: Hl7Repetition | undefined,
): Provider | null {
  const provider = mapProvider(repetition)

  if (!provider.id && !provider.family && !provider.given) {
    return null
  }

  return provider
}
