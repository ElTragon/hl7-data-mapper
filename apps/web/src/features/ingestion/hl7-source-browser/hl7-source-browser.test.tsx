import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  createSourceReference,
  type ReviewableField,
} from "@hl7-data-mapper/contracts"
import { parseHl7Message } from "@hl7-data-mapper/hl7-parser"
import { describe, expect, it, vi } from "vitest"

import { Hl7SourceBrowser } from "./hl7-source-browser"

const BASE_MSH =
  "MSH|^~\\&|SEND|FAC|RECV|FAC|20260706101500-0700||OML^O21^OML_O21|MSG-1|P|2.5.1"

describe("HL7 source browser", () => {
  it("finds a named field through the grid while preserving the message row", async () => {
    const user = userEvent.setup()
    const parsedMessage = parseHl7Message(
      `${BASE_MSH}\nPID|1||MRN-1||Lopez^Mario^D.`,
    )
    const onApplySource = vi.fn()

    render(
      <Hl7SourceBrowser
        parsedMessage={parsedMessage}
        field={createReviewField()}
        onApplySource={onApplySource}
      />,
    )

    expect(
      screen.queryByRole("textbox", { name: "Find a source" }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "Browse message as a grid" }),
    )
    await user.selectOptions(screen.getByLabelText("Segment"), "PID")
    expect(screen.getByText("2", { selector: "td" })).toBeInTheDocument()
    await user.type(
      screen.getByRole("textbox", { name: "Find value or path" }),
      "PID(row 2) × 5.2",
    )
    expect(screen.getByText("1 message row")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "PID message row 2, field 5: Lopez^Mario^D.",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: /PID\(row 2\) × 5\.2.*Mario/,
      }),
    )
    await user.click(
      screen.getByRole("button", { name: "Preview this source" }),
    )

    const selectedPreview = screen
      .getByText("Selected source")
      .closest<HTMLElement>("[data-selected-source-preview]")
    expect(selectedPreview).toHaveTextContent("PID(row 2) × 5.2")
    expect(selectedPreview).toHaveTextContent("Given")
    await user.click(
      within(selectedPreview!).getByRole("button", { name: "Use this source" }),
    )
    expect(onApplySource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        path: "PID-5.2",
        segmentIndex: 1,
      }),
      "given",
    )
  })

  it("does not preview a source hidden by grid filters", async () => {
    const user = userEvent.setup()
    const parsedMessage = parseHl7Message(
      `${BASE_MSH}\nPID|1||MRN-1||Lopez^Mario\nORC|NW|ORDER-1`,
    )

    render(
      <Hl7SourceBrowser
        parsedMessage={parsedMessage}
        field={createReviewField()}
        onApplySource={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "Browse message as a grid" }),
    )
    const previewSourceButton = screen.getByRole("button", {
      name: "Preview this source",
    })
    expect(previewSourceButton).toBeEnabled()

    await user.selectOptions(screen.getByLabelText("Segment"), "ORC")
    expect(previewSourceButton).toBeDisabled()
    expect(screen.getByText("Choose a field in the grid")).toBeInTheDocument()

    await user.type(
      screen.getByRole("textbox", { name: "Find value or path" }),
      "PID(row 2) × 5.2",
    )
    expect(screen.getByText("1 message row")).toBeInTheDocument()
    expect(screen.getByLabelText("Segment")).toHaveValue("")
    expect(screen.getByRole("spinbutton", { name: "Message row" })).toHaveValue(
      null,
    )
    expect(previewSourceButton).toBeEnabled()

    await user.clear(
      screen.getByRole("textbox", { name: "Find value or path" }),
    )
    expect(previewSourceButton).toBeEnabled()
  })

  it("explains the first-repetition behavior for a repeated grid field", async () => {
    const user = userEvent.setup()
    const parsedMessage = parseHl7Message(
      `${BASE_MSH}\nPID|1||LOCAL~MRN-2||Lopez^Mario`,
    )
    render(
      <Hl7SourceBrowser
        parsedMessage={parsedMessage}
        field={createReviewField()}
        onApplySource={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "Browse message as a grid" }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "PID message row 2, field 3: LOCAL~MRN-2",
      }),
    )

    expect(
      screen.getByText(/An unnumbered field reads its first repetition/),
    ).toBeInTheDocument()
  })

  it("does not preview an empty current source hidden by grid options", async () => {
    const user = userEvent.setup()
    const parsedMessage = parseHl7Message(
      `${BASE_MSH}\nPID|1||MRN-1||Lopez^Mario^`,
    )
    const emptyMiddleSource = createSourceReference({
      segment: "PID",
      field: 5,
      component: 3,
      segmentIndex: 1,
    })
    render(
      <Hl7SourceBrowser
        parsedMessage={parsedMessage}
        field={createReviewField({
          primarySource: emptyMiddleSource,
          sources: [emptyMiddleSource],
        })}
        onApplySource={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "Browse message as a grid" }),
    )
    expect(
      screen.getByRole("button", { name: "Preview this source" }),
    ).toBeDisabled()
  })

  it("counts only empty sources that match the active search", () => {
    const parsedMessage = parseHl7Message(`${BASE_MSH}\nPID|1||MRN-1||Lopez^`)

    render(
      <Hl7SourceBrowser
        parsedMessage={parsedMessage}
        field={createReviewField()}
        onApplySource={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", { name: /Search by path or value/ }),
    )
    fireEvent.change(screen.getByRole("textbox", { name: /find a source/i }), {
      target: { value: "PID-5.2" },
    })

    expect(
      screen.getByText(/1 matching source exists, but the value is empty/i),
    ).toBeInTheDocument()
  })

  it("does not include the complete repeated field when repetition one is selected", async () => {
    const user = userEvent.setup()
    const parsedMessage = parseHl7Message(
      `${BASE_MSH}\nPID|1||LOCAL^^^CLINIC^PI~MRN-2^^^LAB^MR||Lopez^Elena`,
    )
    const { container } = render(
      <Hl7SourceBrowser
        parsedMessage={parsedMessage}
        field={createReviewField({
          normalizedPath: "patient.identifiers",
          label: "Patient MRN",
          value: "LOCAL",
          primarySource: createSourceReference({
            segment: "PID",
            field: 3,
            repetition: 1,
            component: 1,
            segmentIndex: 1,
          }),
        })}
        onApplySource={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: /Search by path or value/ }),
    )
    await user.click(
      screen.getByRole("button", { name: /build a source path/i }),
    )
    await user.selectOptions(screen.getByLabelText("Segment"), "PID")
    await user.selectOptions(screen.getByLabelText("Field"), "3")
    await user.selectOptions(screen.getByLabelText("Repetition"), "1")

    expect(
      container.querySelector('[data-source-option="PID-3"]'),
    ).not.toBeInTheDocument()
    expect(
      container.querySelector('[data-source-option="PID-3[1]"]'),
    ).toBeInTheDocument()
  })

  it("resets a person-name role to the source at its canonical position", async () => {
    const user = userEvent.setup()
    const parsedMessage = parseHl7Message(
      `${BASE_MSH}\nPID|1|Maria|MRN-1||Lopez^Elena^^`,
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
    const middleSource = createSourceReference({
      segment: "PID",
      field: 2,
      segmentIndex: 1,
    })
    const suffixSource = createSourceReference({
      segment: "PID",
      field: 5,
      component: 4,
      segmentIndex: 1,
    })
    const prefixSource = createSourceReference({
      segment: "PID",
      field: 5,
      component: 5,
      segmentIndex: 1,
    })

    render(
      <Hl7SourceBrowser
        parsedMessage={parsedMessage}
        field={createReviewField({
          primarySource: familySource,
          sources: [
            familySource,
            givenSource,
            middleSource,
            suffixSource,
            prefixSource,
          ],
        })}
        onApplySource={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: /Search by path or value/ }),
    )
    await user.click(
      screen.getByRole("button", { name: "Middle", pressed: false }),
    )
    await user.click(
      screen.getByRole("button", { name: /reset to current mapping/i }),
    )

    const preview = screen
      .getByText("Selected source")
      .closest<HTMLElement>("[data-selected-source-preview]")

    expect(preview).toHaveTextContent("Middle")
    expect(preview).toHaveTextContent("PID-2")
  })
})

function createReviewField(
  overrides: Partial<ReviewableField> = {},
): ReviewableField {
  const primarySource = createSourceReference({
    segment: "PID",
    field: 5,
    component: 1,
    segmentIndex: 1,
  })

  return {
    id: "patient-name",
    stepId: "patient",
    section: "patient",
    normalizedPath: "patient.name",
    label: "Patient name",
    value: { family: "Lopez", given: null },
    hl7ItemId: "patient-name",
    primarySource,
    sources: [primarySource],
    transformHistory: [],
    validation: [],
    warnings: [],
    reviewStatus: "unreviewed",
    sourceCandidates: [],
    ...overrides,
  }
}

it("resets search when the review field is replaced", () => {
  const parsedMessage = parseHl7Message(
    `${BASE_MSH}\nPID|1||MRN-1||Lopez^Elena`,
  )
  const field = createReviewField()
  const onApplySource = vi.fn()
  const { rerender } = render(
    <Hl7SourceBrowser
      parsedMessage={parsedMessage}
      field={field}
      onApplySource={onApplySource}
    />,
  )
  fireEvent.click(
    screen.getByRole("button", { name: /Search by path or value/ }),
  )
  fireEvent.change(screen.getByRole("textbox", { name: /find a source/i }), {
    target: { value: "Elena" },
  })
  rerender(
    <Hl7SourceBrowser
      parsedMessage={parsedMessage}
      field={{
        ...field,
        primarySource: createSourceReference({ segment: "MSH", field: 3 }),
      }}
      onApplySource={onApplySource}
    />,
  )
  expect(
    screen.queryByRole("textbox", { name: /find a source/i }),
  ).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole("button", { name: /Search by path or value/ }),
  )
  expect(screen.getByRole("textbox", { name: /find a source/i })).toHaveValue(
    "MSH",
  )
})
