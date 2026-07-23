const SEGMENT_LABELS: Readonly<Record<string, string>> = {
  MSH: "Message header",
  PID: "Patient identification",
  PV1: "Patient visit",
  IN1: "Coverage",
  GT1: "Guarantor",
  ORC: "Common order",
  TQ1: "Timing and quantity",
  OBR: "Observation request",
  SPM: "Specimen",
  NTE: "Notes",
}

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  "MSH-3": "Sending application",
  "MSH-4": "Sending facility",
  "MSH-5": "Receiving application",
  "MSH-6": "Receiving facility",
  "MSH-7": "Message timestamp",
  "MSH-9": "Message type",
  "MSH-9.1": "Message code",
  "MSH-9.2": "Trigger event",
  "MSH-9.3": "Message structure",
  "MSH-10": "Message control ID",
  "MSH-11": "Processing ID",
  "MSH-12": "HL7 version",
  "PID-3": "Patient identifier",
  "PID-3.1": "Identifier value",
  "PID-3.4": "Assigning authority",
  "PID-3.5": "Identifier type",
  "PID-5": "Patient name",
  "PID-5.1": "Family name",
  "PID-5.2": "Given name",
  "PID-5.3": "Middle name or initial",
  "PID-5.4": "Name suffix",
  "PID-5.5": "Name prefix",
  "PID-7": "Date of birth",
  "PID-8": "Administrative sex",
  "PID-11": "Patient address",
  "PID-13": "Patient phone number",
  "IN1-2": "Coverage plan",
  "IN1-3": "Insurer identifier",
  "IN1-4": "Insurer name",
  "IN1-8": "Group number",
  "IN1-36": "Policy number",
  "GT1-2": "Guarantor identifier",
  "GT1-3": "Guarantor name",
  "GT1-5": "Guarantor address",
  "GT1-6": "Guarantor phone number",
  "ORC-1": "Order control code",
  "ORC-2": "Placer order number",
  "ORC-3": "Filler order number",
  "ORC-5": "Order status",
  "ORC-12": "Ordering provider",
  "TQ1-7": "Requested start time",
  "TQ1-8": "Requested end time",
  "TQ1-9": "Order priority",
  "OBR-2": "Placer order number",
  "OBR-3": "Filler order number",
  "OBR-4": "Requested test",
  "OBR-4.1": "Test code",
  "OBR-4.2": "Test name",
  "OBR-4.3": "Test code system",
  "OBR-16": "Ordering provider",
  "SPM-1": "Specimen sequence",
  "SPM-2": "Specimen identifier",
  "SPM-4": "Specimen type",
  "SPM-4.1": "Specimen type code",
  "SPM-4.2": "Specimen type name",
  "SPM-4.3": "Specimen code system",
  "SPM-11": "Specimen role",
  "SPM-17": "Collection time",
  "SPM-18": "Received time",
  "SPM-27": "Container type",
}

export function getSegmentLabel(segmentName: string): string {
  return SEGMENT_LABELS[segmentName] ?? "Client or unsupported segment"
}

export function getSourceDisplayLabel(path: string): string {
  const pathWithoutRepetition = path.replace(/\[\d+\]/g, "")

  return (
    SOURCE_LABELS[pathWithoutRepetition] ??
    fallbackSourceLabel(pathWithoutRepetition)
  )
}

function fallbackSourceLabel(path: string): string {
  const fieldMatch = /^[A-Z0-9]{3}-(\d+)/.exec(path)

  return fieldMatch?.[1] ? `Field ${fieldMatch[1]}` : "HL7 source"
}
