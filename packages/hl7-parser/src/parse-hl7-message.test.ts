import { describe, expect, it } from "vitest"

import { parseHl7Message } from "./parse-hl7-message.js"

describe("parseHl7Message delimiter detection", () => {
  it("detects the common HL7 delimiters from MSH", () => {
    const parsed = parseHl7Message(
      [
        "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202601010101||OML^O21^OML_O21|MSG1|P|2.5.1",
        "PID|1||12345^^^MR||DOE^JANE",
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
