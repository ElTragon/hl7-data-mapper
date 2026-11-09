import { describe, expect, it } from "vitest"
import {
  createSourceReference,
  Hl7ItemSchema,
  ReportReviewDecisionSchema,
} from "@hl7-data-mapper/contracts"

import {
  buildMappingSummaryCsv,
  buildMappingSummaryRows,
  escapeCsvCell,
} from "./mapping-summary.js"

describe("mapping summary CSV formatting", () => {
  it.each(["=SUM(A1:A2)", "+1", "-1", "@command", "\tvalue"])(
    "neutralizes spreadsheet formula input %s",
    (value) => {
      expect(escapeCsvCell(value)).toBe(`'${value}`)
    },
  )

  it("neutralizes and quotes carriage-return input", () => {
    expect(escapeCsvCell("\rvalue")).toBe('"\'\rvalue"')
  })

  it("quotes commas, quotes, and line breaks", () => {
    expect(escapeCsvCell('value, with "quotes"\nand a line')).toBe(
      '"value, with ""quotes""\nand a line"',
    )
  })

  it("leaves ordinary values unchanged", () => {
    expect(escapeCsvCell("confirmed")).toBe("confirmed")
  })

  it("lists every source row and literal split in mapping order", () => {
    const reviewDecision = ReportReviewDecisionSchema.parse({
      fieldId: "patient-label",
      normalizedPath: "patient.name.family",
      hl7ItemId: "patient-label",
      reviewStatus: "confirmed",
      sourcePath: "PID-5.1",
      sourceReferences: [
        createSourceReference({
          segment: "PID",
          field: 5,
          component: 1,
          segmentIndex: 1,
        }),
        createSourceReference({
          segment: "OBR",
          field: 4,
          component: 2,
          segmentIndex: 5,
          literalSplit: { separator: "/", partNumber: 2 },
        }),
      ],
      updatedAt: "2026-11-05T00:00:00Z",
    })

    const [summaryRow] = buildMappingSummaryRows([reviewDecision])
    expect(summaryRow?.sourcePath).toBe("PID-5.1")
    expect(summaryRow?.sourceDetails).toBe(
      'PID(row 2) × 5.1; OBR(row 6) × 4.2 split on "/", part 2',
    )
    expect(buildMappingSummaryCsv([summaryRow!])).toContain(
      '"PID(row 2) × 5.1; OBR(row 6) × 4.2 split on ""/"", part 2"',
    )
  })

  it("records the separator used to join multiple sources", () => {
    const firstSource = createSourceReference({
      segment: "PID",
      field: 3,
      component: 1,
      segmentIndex: 1,
    })
    const secondSource = createSourceReference({
      segment: "MSH",
      field: 3,
      segmentIndex: 0,
    })
    const reviewDecision = ReportReviewDecisionSchema.parse({
      fieldId: "message-control-id",
      normalizedPath: "message.controlId",
      hl7ItemId: "message-control-id",
      reviewStatus: "mapping_changed",
      sourcePath: firstSource.path,
      sourceReferences: [firstSource, secondSource],
      updatedAt: "2026-11-05T00:00:00Z",
    })
    const joinedMappingItem = Hl7ItemSchema.parse({
      id: "message-control-id",
      clientId: "client-1",
      sequence: 1,
      section: "sender",
      targetPath: "message.controlId",
      label: "Message control ID",
      action: "join",
      valueType: "string",
      sources: [firstSource, secondSource],
      joinSeparator: " / ",
    })

    const [summaryRow] = buildMappingSummaryRows(
      [reviewDecision],
      [joinedMappingItem],
    )

    expect(summaryRow?.sourceDetails).toBe(
      'PID(row 2) × 3.1; MSH(row 1) × 3; join with " / "',
    )
  })

  it("uses current sources for a direct mapping with a stale review decision", () => {
    const previouslyReviewedSource = createSourceReference({
      segment: "PID",
      field: 3,
      segmentIndex: 1,
    })
    const currentFirstSource = createSourceReference({
      segment: "OBR",
      field: 4,
      segmentIndex: 5,
      literalSplit: { separator: "/", partNumber: 2 },
    })
    const currentSecondSource = createSourceReference({
      segment: "MSH",
      field: 3,
      segmentIndex: 0,
    })
    const staleDecision = ReportReviewDecisionSchema.parse({
      fieldId: "message-control-id",
      normalizedPath: "message.controlId",
      hl7ItemId: "message-control-id",
      reviewStatus: "confirmed",
      sourcePath: previouslyReviewedSource.path,
      sourceReferences: [previouslyReviewedSource],
      updatedAt: "2026-11-05T00:00:00Z",
    })
    const currentMappingItem = Hl7ItemSchema.parse({
      id: "message-control-id",
      clientId: "client-1",
      sequence: 1,
      section: "sender",
      targetPath: "message.controlId",
      label: "Message control ID",
      action: "join",
      valueType: "string",
      sources: [currentFirstSource, currentSecondSource],
      joinSeparator: " / ",
    })

    const [summaryRow] = buildMappingSummaryRows(
      [staleDecision],
      [currentMappingItem],
    )

    expect(summaryRow?.sourcePath).toBe("OBR-4")
    expect(summaryRow?.sourceDetails).toBe(
      'OBR(row 6) × 4 split on "/", part 2; MSH(row 1) × 3; join with " / "',
    )
  })

  it("keeps sources tied to a record leaf instead of its parent item", () => {
    const parentSource = createSourceReference({
      segment: "ORC",
      field: 1,
      segmentIndex: 2,
    })
    const recordLeafSource = createSourceReference({
      segment: "OBR",
      field: 3,
      segmentIndex: 3,
    })
    const recordLeafDecision = ReportReviewDecisionSchema.parse({
      fieldId: "lab-order-groups:labOrders[0].fillerOrderNumber",
      normalizedPath: "labOrders[0].fillerOrderNumber",
      hl7ItemId: "lab-order-groups",
      reviewStatus: "confirmed",
      sourcePath: recordLeafSource.path,
      sourceReferences: [recordLeafSource],
      updatedAt: "2026-11-05T00:00:00Z",
    })
    const parentMappingItem = Hl7ItemSchema.parse({
      id: "lab-order-groups",
      clientId: "client-1",
      sequence: 1,
      section: "labOrders",
      targetPath: "labOrders",
      label: "Laboratory orders",
      action: "compose",
      valueType: "array",
      sources: [parentSource],
    })

    const [summaryRow] = buildMappingSummaryRows(
      [recordLeafDecision],
      [parentMappingItem],
    )

    expect(summaryRow?.sourcePath).toBe("OBR-3")
    expect(summaryRow?.sourceDetails).toBe("OBR(row 4) × 3")
  })

  it("keeps an issue-only row's source when no mapping item exists", () => {
    const issueSource = createSourceReference({
      segment: "PID",
      field: 5,
      segmentIndex: 1,
    })
    const issueDecision = ReportReviewDecisionSchema.parse({
      fieldId: "issue:missing-patient-name",
      normalizedPath: "patient.name",
      hl7ItemId: null,
      reviewStatus: "confirmed",
      sourcePath: issueSource.path,
      sourceReferences: [issueSource],
      updatedAt: "2026-11-05T00:00:00Z",
    })

    const [summaryRow] = buildMappingSummaryRows([issueDecision])

    expect(summaryRow?.sourcePath).toBe("PID-5")
    expect(summaryRow?.sourceDetails).toBe("PID(row 2) × 5")
  })
})
