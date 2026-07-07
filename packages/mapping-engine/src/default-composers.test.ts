import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"

import expectedOutput from "../../../fixtures/expected/oml-o21-basic.normalized.json"
import {
  composeCoverages,
  composeGuarantor,
  composeLabOrders,
  composeMessageMetadata,
  composePatient,
  composeSender,
} from "./default-composers.js"

const fixture = `MSH|^~\\&|NORTHSTAR_LIS|NORTHSTAR_LAB|HL7_MAPPER|DEMO_FACILITY|20260706101500-0700||OML^O21^OML_O21|MSG-20260706-0001|P|2.5.1|||AL|NE|USA|ASCII
PID|1||MRN-104892^^^NORTHSTAR_LAB^MR||Lopez^Elena^M||19870514|F|||742 Evergreen Ave^^Los Angeles^CA^90017^USA||^PRN^PH^^^213^5550142
PV1|1|O|LAB^^^NORTHSTAR_LAB||||12345^Patel^Anika^^^^MD
IN1|1|PPO-42^Preferred Provider Plan^99DEMO|ACME-001^^^ACME^NI|Acme Health Plan||||GRP-7781||||||||Lopez^Elena^M|SEL^Self^HL70063|||||||||||||||||||POL-558903
GT1|1|GT-104892^^^NORTHSTAR_LAB^GU|Lopez^Elena^M||742 Evergreen Ave^^Los Angeles^CA^90017^USA|^PRN^PH^^^213^5550142||19870514|F|P|SEL^Self^HL70063
ORC|NW|ORD-90017^NORTHSTAR_LIS|FILL-41220^NORTHSTAR_LAB||SC||||20260706101000-0700|||12345^Patel^Anika^^^^MD
TQ1|1||||||20260706103000-0700||R^Routine^HL70485
OBR|1|ORD-90017^NORTHSTAR_LIS|FILL-41220^NORTHSTAR_LAB|57021-8^CBC W Auto Differential panel^LN||||||||||||12345^Patel^Anika^^^^MD
SPM|1|SPM-90017&NORTHSTAR_LIS^SPM-41220&NORTHSTAR_LAB||BLD^Whole blood^HL70487|||||||P^Patient specimen^HL70369||||||20260706100000-0700^20260706100500-0700|20260706102000-0700|||||||||TUBE^Collection tube^99DEMO
ORC|NW|ORD-90018^NORTHSTAR_LIS|FILL-41221^NORTHSTAR_LAB||SC||||20260706101100-0700|||12345^Patel^Anika^^^^MD
TQ1|1||||||20260706103500-0700||R^Routine^HL70485
OBR|1|ORD-90018^NORTHSTAR_LIS|FILL-41221^NORTHSTAR_LAB|24323-8^Comprehensive metabolic 2000 panel - Serum or Plasma^LN||||||||||||12345^Patel^Anika^^^^MD
SPM|1|SPM-90018&NORTHSTAR_LIS^SPM-41221&NORTHSTAR_LAB||SER^Serum^HL70487|||||||P^Patient specimen^HL70369||||||20260706100200-0700^20260706100700-0700|20260706102200-0700|||||||||TUBE^Collection tube^99DEMO`

describe("default composers", () => {
  const parsedMessage = parseHl7Message(fixture)

  it("composes MSH message metadata", () => {
    expect(composeMessageMetadata(parsedMessage)).toEqual(
      expectedOutput.message,
    )
  })

  it("composes MSH sender metadata", () => {
    expect(composeSender(parsedMessage)).toEqual(expectedOutput.sender)
  })

  it("composes PID patient data", () => {
    expect(composePatient(parsedMessage)).toEqual(expectedOutput.patient)
  })

  it("composes repeating IN1 coverage records", () => {
    expect(composeCoverages(parsedMessage)).toEqual(expectedOutput.coverages)
  })

  it("composes optional GT1 guarantor data", () => {
    expect(composeGuarantor(parsedMessage)).toEqual(expectedOutput.guarantor)
  })

  it("composes ORC OBR TQ1 lab orders with SPM specimens", () => {
    expect(composeLabOrders(parsedMessage)).toEqual(expectedOutput.labOrders)
  })
})
