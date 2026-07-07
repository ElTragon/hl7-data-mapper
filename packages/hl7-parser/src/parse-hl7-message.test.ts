import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { parseHl7Message } from "./parse-hl7-message.js"

function readFixture(path: string): string {
  return readFileSync(new URL(`../../../fixtures/${path}`, import.meta.url), {
    encoding: "utf8",
  })
}

describe("parseHl7Message delimiter detection", () => {
  it("detects the common HL7 delimiters from MSH", () => {
    const parsed = parseHl7Message(
      [
        "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202601010101||OML^O21^OML_O21|MSG1|P|2.5.1",
        "PID|1||12345^^^MR||DOE^JANE",
        "ORC|NW|ORDER-1",
        "OBR|1|ORDER-1||57021-8^CBC^LN",
        "SPM|1|SPECIMEN-1",
      ].join("\r"),
    )

    expect(parsed.delimiters).toEqual({
      field: "|",
      component: "^",
      repetition: "~",
      escape: "\\",
      subcomponent: "&",
    })
    expect(parsed.messageType).toEqual({
      code: "OML",
      triggerEvent: "O21",
      structure: "OML_O21",
      raw: "OML^O21^OML_O21",
    })
    expect(parsed.version).toBe("2.5.1")
    expect(parsed.errors).toEqual([])
  })

  it("uses custom MSH delimiters when the message declares them", () => {
    const parsed = parseHl7Message(
      [
        "MSH*$%!?*SENDAPP*SENDFAC*RECVAPP*RECVFAC*202601010101**OML$O21$OML_O21*MSG1*P*2.5.1",
        "PID*1**12345$$$MR**DOE$JANE?M",
      ].join("\r"),
    )

    expect(parsed.delimiters).toEqual({
      field: "*",
      component: "$",
      repetition: "%",
      escape: "!",
      subcomponent: "?",
    })
    expect(parsed.messageType).toEqual({
      code: "OML",
      triggerEvent: "O21",
      structure: "OML_O21",
      raw: "OML$O21$OML_O21",
    })

    const patientName = parsed.segments
      .find((segment) => segment.name === "PID")
      ?.fields.find((field) => field.index === 5)

    expect(patientName?.repetitions[0]?.components).toEqual([
      { value: "DOE", subComponents: ["DOE"] },
      { value: "JANE?M", subComponents: ["JANE", "M"] },
    ])
  })

  it("falls back to common delimiters when MSH is missing", () => {
    const parsed = parseHl7Message("PID|1||12345^^^MR||DOE^JANE")

    expect(parsed.delimiters).toEqual({
      field: "|",
      component: "^",
      repetition: "~",
      escape: "\\",
      subcomponent: "&",
    })
    expect(parsed.errors).toContainEqual({
      code: "missing_msh",
      severity: "error",
      message: "HL7 message must start with an MSH segment.",
      segmentIndex: 0,
      segmentName: "PID",
    })
  })
})

describe("parseHl7Message segment and field parsing", () => {
  it("normalizes line endings and preserves ordered segments", () => {
    const parsed = parseHl7Message(
      [
        "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202601010101||OML^O21^OML_O21|MSG1|P|2.5.1",
        "PID|1||12345^^^MR||DOE^JANE",
        "ORC|NW|ORDER-1",
        "OBR|1|ORDER-1||57021-8^CBC^LN",
        "SPM|1|SPECIMEN-1",
      ].join("\n"),
    )

    expect(parsed.normalizedText).toContain("\r")
    expect(parsed.segments.map((segment) => segment.name)).toEqual([
      "MSH",
      "PID",
      "ORC",
      "OBR",
      "SPM",
    ])
  })

  it("keeps MSH field numbering aligned with HL7", () => {
    const parsed = parseHl7Message(
      [
        "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202601010101||OML^O21^OML_O21|MSG1|P|2.5.1",
        "PID|1||12345^^^MR||DOE^JANE",
        "ORC|NW|ORDER-1",
        "OBR|1|ORDER-1||57021-8^CBC^LN",
        "SPM|1|SPECIMEN-1",
      ].join("\r"),
    )

    const msh = parsed.segments.find((segment) => segment.name === "MSH")

    expect(msh?.fields[0]).toMatchObject({
      path: "MSH-1",
      index: 1,
      raw: "|",
    })
    expect(msh?.fields.find((field) => field.index === 9)?.raw).toBe(
      "OML^O21^OML_O21",
    )
    expect(msh?.fields.find((field) => field.index === 12)?.raw).toBe("2.5.1")
  })

  it("parses repetitions, components, and subComponents", () => {
    const parsed = parseHl7Message(
      [
        "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202601010101||OML^O21^OML_O21|MSG1|P|2.5.1",
        "PID|1||EPI-1^^^HIE^PI~MRN-1^^^CLINIC^MR||DOE^JANE",
        "ORC|NW|ORDER-1",
        "OBR|1|ORDER-1||57021-8^CBC^LN",
        "SPM|1|LEFT&RIGHT^TUBE",
      ].join("\r"),
    )

    const pid = parsed.segments.find((segment) => segment.name === "PID")
    const identifiers = pid?.fields.find((field) => field.index === 3)
    const specimen = parsed.segments
      .find((segment) => segment.name === "SPM")
      ?.fields.find((field) => field.index === 2)

    expect(identifiers?.path).toBe("PID-3")
    expect(identifiers?.repetitions).toHaveLength(2)
    expect(identifiers?.repetitions[1]?.components).toEqual([
      { value: "MRN-1", subComponents: ["MRN-1"] },
      { value: "", subComponents: [""] },
      { value: "", subComponents: [""] },
      { value: "CLINIC", subComponents: ["CLINIC"] },
      { value: "MR", subComponents: ["MR"] },
    ])
    expect(specimen?.repetitions[0]?.components[0]).toEqual({
      value: "LEFT&RIGHT",
      subComponents: ["LEFT", "RIGHT"],
    })
  })
})

describe("parseHl7Message fixtures", () => {
  it("parses the basic valid OML/O21 fixture", () => {
    const parsed = parseHl7Message(readFixture("valid/oml-o21-basic.hl7"))

    expect(parsed.errors).toEqual([])
    expect(parsed.warnings).toEqual([])
    expect(parsed.messageType).toMatchObject({
      code: "OML",
      triggerEvent: "O21",
      structure: "OML_O21",
    })
    expect(parsed.version).toBe("2.5.1")
    expect(parsed.segments.map((segment) => segment.name)).toEqual([
      "MSH",
      "PID",
      "PV1",
      "IN1",
      "GT1",
      "ORC",
      "TQ1",
      "OBR",
      "SPM",
      "ORC",
      "TQ1",
      "OBR",
      "SPM",
    ])
  })

  it("reports the missing PID invalid fixture", () => {
    const parsed = parseHl7Message(
      readFixture("invalid/oml-o21-missing-pid.hl7"),
    )

    expect(parsed.errors).toContainEqual({
      code: "missing_pid",
      severity: "error",
      message: "The MVP application profile requires a PID segment.",
    })
  })

  it("preserves repeating identifiers from the client variant fixture", () => {
    const parsed = parseHl7Message(
      readFixture("client-variants/oml-o21-repeating-identifiers.hl7"),
    )
    const pid = parsed.segments.find((segment) => segment.name === "PID")
    const identifiers = pid?.fields.find((field) => field.index === 3)

    expect(parsed.errors).toEqual([])
    expect(identifiers?.repetitions).toHaveLength(2)
    expect(identifiers?.repetitions[0]?.components[4]?.value).toBe("PI")
    expect(identifiers?.repetitions[1]?.components[4]?.value).toBe("MR")
  })
})

describe("parseHl7Message MVP profile validation", () => {
  it("reports unsupported message types", () => {
    const parsed = parseHl7Message(
      [
        "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202601010101||ADT^A01^ADT_A01|MSG1|P|2.5.1",
        "PID|1||12345^^^MR||DOE^JANE",
        "ORC|NW|ORDER-1",
        "OBR|1|ORDER-1||57021-8^CBC^LN",
        "SPM|1|SPECIMEN-1",
      ].join("\r"),
    )

    expect(parsed.errors).toContainEqual({
      code: "unsupported_message_type",
      severity: "error",
      message: "Only OML^O21^OML_O21 messages are supported in the MVP.",
      segmentIndex: 0,
      segmentName: "MSH",
    })
  })

  it("reports unsupported HL7 versions", () => {
    const parsed = parseHl7Message(
      [
        "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202601010101||OML^O21^OML_O21|MSG1|P|2.3.1",
        "PID|1||12345^^^MR||DOE^JANE",
        "ORC|NW|ORDER-1",
        "OBR|1|ORDER-1||57021-8^CBC^LN",
        "SPM|1|SPECIMEN-1",
      ].join("\r"),
    )

    expect(parsed.errors).toContainEqual({
      code: "unsupported_hl7_version",
      severity: "error",
      message: "Only HL7 version 2.5.1 is supported in the MVP.",
      segmentIndex: 0,
      segmentName: "MSH",
    })
  })

  it("reports missing order content", () => {
    const parsed = parseHl7Message(
      [
        "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202601010101||OML^O21^OML_O21|MSG1|P|2.5.1",
        "PID|1||12345^^^MR||DOE^JANE",
      ].join("\r"),
    )

    expect(parsed.errors).toContainEqual({
      code: "missing_order",
      severity: "error",
      message:
        "The MVP application profile requires ORC and OBR order content.",
    })
  })

  it("warns when an order group has no SPM", () => {
    const parsed = parseHl7Message(
      [
        "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202601010101||OML^O21^OML_O21|MSG1|P|2.5.1",
        "PID|1||12345^^^MR||DOE^JANE",
        "ORC|NW|ORDER-1",
        "OBR|1|ORDER-1||57021-8^CBC^LN",
      ].join("\r"),
    )

    expect(parsed.errors).toEqual([])
    expect(parsed.warnings).toContainEqual({
      code: "missing_spm",
      severity: "warning",
      message: "Order group has no SPM specimen segment.",
      segmentIndex: 2,
      segmentName: "ORC",
    })
  })
})
