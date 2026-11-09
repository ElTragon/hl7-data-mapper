import { createSourceReference, type Hl7Item } from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it } from "vitest"

import { executeMapping } from "../execute-mapping.js"
import { mapPersonNameFromSourceValues } from "../execution/transforms/patient.js"
import { defaultOmlO21ClientProfile } from "../profiles/default-oml-o21-profile.js"
import { readSource } from "../source-lookup.js"
import { findSourceExpectationForRead } from "../source-expectation.js"
import { replacePersonNameRoleSource } from "./person-name-corrections.js"
import { collectReviewValidation } from "./warning-review-fields.js"

const messageHeader =
  "MSH|^~\\&|SEND|FAC|RECV|FAC|20260706101500||OML^O21^OML_O21|MSG-1|P|2.5.1"

function defaultPatientNameItem(): Hl7Item {
  const nameItem = defaultOmlO21ClientProfile.itemSet.items.find(
    (item) => item.id === "patient-name",
  )
  if (!nameItem) throw new Error("Expected the default patient-name item.")
  return nameItem
}

function splitNameSource(partNumber: number) {
  return createSourceReference({
    segment: "PID",
    field: 5,
    segmentIndex: 1,
    literalSplit: { separator: " ", partNumber },
  })
}

function profileWithNameItem(nameItem: Hl7Item) {
  return {
    ...defaultOmlO21ClientProfile,
    itemSet: {
      ...defaultOmlO21ClientProfile.itemSet,
      items: defaultOmlO21ClientProfile.itemSet.items.map((item) =>
        item.id === nameItem.id ? nameItem : item,
      ),
    },
  }
}

describe("person name sources split from one HL7 field", () => {
  it("maps the family, given, and middle parts to their selected roles", () => {
    const withGiven = replacePersonNameRoleSource({
      item: defaultPatientNameItem(),
      source: splitNameSource(1),
      sourceRole: "given",
    })
    const withMiddle = replacePersonNameRoleSource({
      item: withGiven,
      source: splitNameSource(2),
      sourceRole: "middle",
    })
    const nameItem = replacePersonNameRoleSource({
      item: withMiddle,
      source: splitNameSource(3),
      sourceRole: "family",
    })
    const parsedMessage = parseHl7Message(
      `${messageHeader}\rPID|1||MRN||Mario D. Lopez`,
    )
    const mappingResult = executeMapping({
      parsedMessage,
      profile: profileWithNameItem(nameItem),
    })

    expect(mappingResult.normalizedDraft).toMatchObject({
      patient: {
        name: { family: "Lopez", given: "Mario", middle: "D." },
      },
    })
    expect(
      nameItem.sourceExpectations.slice(0, 3).map((expectation) => ({
        label: expectation.expectedLabel,
        requiredness: expectation.requiredness,
        partNumber: expectation.literalSplit?.partNumber,
      })),
    ).toEqual([
      { label: "Patient family name", requiredness: "required", partNumber: 3 },
      { label: "Patient given name", requiredness: "required", partNumber: 1 },
      {
        label: "Patient middle name or initial",
        requiredness: "optional",
        partNumber: 2,
      },
    ])
  })

  it("classifies a missing optional split part using that part's expectation", () => {
    const withGiven = replacePersonNameRoleSource({
      item: defaultPatientNameItem(),
      source: splitNameSource(1),
      sourceRole: "given",
    })
    const withFamily = replacePersonNameRoleSource({
      item: withGiven,
      source: splitNameSource(2),
      sourceRole: "family",
    })
    const nameItem = replacePersonNameRoleSource({
      item: withFamily,
      source: splitNameSource(3),
      sourceRole: "middle",
    })
    const parsedMessage = parseHl7Message(
      `${messageHeader}\rPID|1||MRN||Mario Lopez`,
    )
    const mappingResult = executeMapping({
      parsedMessage,
      profile: profileWithNameItem(nameItem),
    })
    const patientNameTrace = mappingResult.executionTrace.find(
      (entry) => entry.itemId === "patient-name",
    )
    if (!patientNameTrace) throw new Error("Expected patient-name trace.")

    const missingPartIndex = patientNameTrace.sourceReads.findIndex(
      (read) => read.source.literalSplit?.partNumber === 3,
    )
    expect(patientNameTrace.sourceReads[missingPartIndex]?.status).toBe(
      "missing_split_part",
    )
    expect(
      findSourceExpectationForRead(
        patientNameTrace.sourceExpectations,
        patientNameTrace.sourceReads,
        missingPartIndex,
      ),
    ).toMatchObject({
      expectedLabel: "Patient middle name or initial",
      requiredness: "optional",
    })
    expect(collectReviewValidation(mappingResult, parsedMessage).info).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "source-read-missing_split_part",
          source: expect.objectContaining({
            literalSplit: { separator: " ", partNumber: 3 },
          }),
        }),
      ]),
    )
  })

  it("keeps a missing family split part as a warning", () => {
    const withGiven = replacePersonNameRoleSource({
      item: defaultPatientNameItem(),
      source: splitNameSource(1),
      sourceRole: "given",
    })
    const nameItem = replacePersonNameRoleSource({
      item: withGiven,
      source: splitNameSource(3),
      sourceRole: "family",
    })
    const parsedMessage = parseHl7Message(
      `${messageHeader}\rPID|1||MRN||Mario Lopez`,
    )
    const mappingResult = executeMapping({
      parsedMessage,
      profile: profileWithNameItem(nameItem),
    })

    expect(
      collectReviewValidation(mappingResult, parsedMessage).warnings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "source-read-missing_split_part",
          source: expect.objectContaining({
            literalSplit: { separator: " ", partNumber: 3 },
          }),
        }),
      ]),
    )
  })

  it("continues honoring legacy path-only role entries", () => {
    const originalItem = defaultPatientNameItem()
    const nameItem = {
      ...originalItem,
      sources: [originalItem.sources[1]!, originalItem.sources[0]!],
      transform: {
        ...originalItem.transform!,
        params: {
          sourceRoles: [
            { path: "PID-5.1", segmentIndex: null, role: "family" },
            { path: "PID-5.2", segmentIndex: null, role: "given" },
          ],
        },
      },
    }

    expect(
      mapPersonNameFromSourceValues(nameItem, ["Mario", "Lopez"]),
    ).toMatchObject({ family: "Lopez", given: "Mario" })
  })

  it("falls back to path matching for reordered legacy expectations", () => {
    const parsedMessage = parseHl7Message(
      `${messageHeader}\rPID|1||MRN||Lopez^Mario`,
    )
    const familySource = createSourceReference({
      segment: "PID",
      field: 5,
      component: 1,
      segmentIndex: 1,
    })
    const givenSource = createSourceReference({
      segment: "PID",
      field: 5,
      component: 2,
      segmentIndex: 1,
    })
    const sourceReads = [
      readSource(parsedMessage, familySource),
      readSource(parsedMessage, givenSource),
    ]
    const reversedExpectations = defaultPatientNameItem()
      .sourceExpectations.slice(0, 2)
      .reverse()

    expect(
      findSourceExpectationForRead(reversedExpectations, sourceReads, 0)
        ?.expectedLabel,
    ).toBe("Patient family name")
  })
})
