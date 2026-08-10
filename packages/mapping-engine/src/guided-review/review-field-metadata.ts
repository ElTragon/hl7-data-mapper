import type {
  Hl7Item,
  NormalizedOutputSection,
  ReviewableField,
} from "@hl7-data-mapper/contracts"

import type { MappingExecutionTraceEntry } from "../execute-mapping.js"

export function stepIdFromSection(
  section: NormalizedOutputSection,
): ReviewableField["stepId"] {
  if (section === "coverage" || section === "guarantor") {
    return "coverageGuarantor"
  }
  if (section === "labOrders") {
    return "labOrders"
  }
  if (section === "exceptions") {
    return "warnings"
  }
  return section
}

export function sectionFromPath(path: string): NormalizedOutputSection {
  if (path.startsWith("patient.")) return "patient"
  if (path.startsWith("coverages.") || path.startsWith("coverages[")) {
    return "coverage"
  }
  if (path.startsWith("guarantor.") || path === "guarantor") return "guarantor"
  if (path.startsWith("labOrders.") || path.startsWith("labOrders[")) {
    return "labOrders"
  }
  if (path.startsWith("message.") || path.startsWith("sender.")) return "sender"
  return "exceptions"
}

export function firstRawSegment(
  trace: MappingExecutionTraceEntry | undefined,
): string | null {
  return trace?.sourceReads.find((read) => read.rawSegment)?.rawSegment ?? null
}

export function sourceCandidateReason(
  item: Hl7Item | undefined,
  trace: MappingExecutionTraceEntry,
): string {
  return item
    ? `Source read for "${item.label}".`
    : `Read while mapping ${trace.targetPath}.`
}
