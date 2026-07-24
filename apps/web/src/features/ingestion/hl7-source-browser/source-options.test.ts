import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"

import { buildSourceOptions } from "./source-options"

const BASE_MSH =
  "MSH|^~\\&|SEND|FAC|RECV|FAC|20260706101500-0700||OML^O21^OML_O21|MSG-1|P|2.5.1"

describe("source options", () => {
  it("preserves empty trailing components without inventing subcomponents", () => {
    const parsedMessage = parseHl7Message(
      `${BASE_MSH}\nPID|1||MRN-1||Lopez^Elena^^||19870514|F`,
    )
    const options = buildSourceOptions(parsedMessage)

    expect(sourceValue(options, "PID-5.1")).toBe("Lopez")
    expect(sourceValue(options, "PID-5.2")).toBe("Elena")
    expect(sourceValue(options, "PID-5.3")).toBe("")
    expect(sourceValue(options, "PID-5.4")).toBe("")
    expect(sourcePaths(options)).not.toContain("PID-5.1.1")
    expect(sourcePaths(options)).toContain("PID-8")
    expect(sourcePaths(options)).not.toContain("PID-8.1")
  })

  it("creates distinct choices for field repetitions and components", () => {
    const parsedMessage = parseHl7Message(
      `${BASE_MSH}\nPID|1||LOCAL^^^CLINIC^PI~MRN-2^^^LAB^MR||Lopez^Elena`,
    )
    const options = buildSourceOptions(parsedMessage)

    expect(sourceValue(options, "PID-3[1]")).toBe("LOCAL^^^CLINIC^PI")
    expect(sourceValue(options, "PID-3[2]")).toBe("MRN-2^^^LAB^MR")
    expect(sourceValue(options, "PID-3[2].1")).toBe("MRN-2")
    expect(sourceValue(options, "PID-3[2].5")).toBe("MR")
  })

  it("only creates subcomponent choices when the source contains them", () => {
    const parsedMessage = parseHl7Message(
      `${BASE_MSH}\nPID|1||MRN-1||Lopez^Elena||||||742 Evergreen Ave&Unit 4^^Los Angeles`,
    )
    const options = buildSourceOptions(parsedMessage)

    expect(sourceValue(options, "PID-11.1.1")).toBe("742 Evergreen Ave")
    expect(sourceValue(options, "PID-11.1.2")).toBe("Unit 4")
    expect(sourcePaths(options)).not.toContain("PID-11.3.1")
  })

  it("uses delimiters detected from MSH instead of assuming pipe and caret", () => {
    const parsedMessage = parseHl7Message(
      [
        "MSH*%$!@*SEND*FAC*RECV*FAC*20260706101500-0700**OML%O21%OML_O21*MSG-1*P*2.5.1",
        "PID*1**MRN-1**Lopez%Elena%%**19870514*F",
      ].join("\n"),
    )
    const options = buildSourceOptions(parsedMessage)

    expect(parsedMessage.delimiters.field).toBe("*")
    expect(parsedMessage.delimiters.component).toBe("%")
    expect(sourceValue(options, "PID-5.1")).toBe("Lopez")
    expect(sourceValue(options, "PID-5.2")).toBe("Elena")
    expect(sourceValue(options, "PID-5.3")).toBe("")
  })

  it("keeps MSH field numbering aligned with HL7 conventions", () => {
    const options = buildSourceOptions(parseHl7Message(BASE_MSH))

    expect(sourceValue(options, "MSH-1")).toBe("|")
    expect(sourceValue(options, "MSH-3")).toBe("SEND")
    expect(sourceValue(options, "MSH-12")).toBe("2.5.1")
  })
})

function sourcePaths(options: ReturnType<typeof buildSourceOptions>): string[] {
  return options.map((option) => option.path)
}

function sourceValue(
  options: ReturnType<typeof buildSourceOptions>,
  path: string,
): string | undefined {
  return options.find((option) => option.path === path)?.previewValue
}
