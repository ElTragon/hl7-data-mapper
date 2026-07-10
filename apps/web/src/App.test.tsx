import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import App from "./App"
import sampleHl7Message from "../../../fixtures/valid/oml-o21-basic.hl7?raw"

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it("introduces the mapper and its synthetic-data boundary", () => {
    render(<App />)

    expect(
      screen.getByRole("heading", {
        name: /turn messy hl7 messages into verified client mappings/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/synthetic data only/i).length).toBeGreaterThan(
      0,
    )
  })

  it("parses the built-in synthetic HL7 sample", async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole("button", { name: /parse message/i }))

    expect(screen.getAllByText("OML^O21^OML_O21").length).toBeGreaterThan(0)
    expect(screen.getAllByText("2.5.1").length).toBeGreaterThan(0)
    expect(
      screen.getByText(/message can continue to review/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /download report zip/i }),
    ).toBeEnabled()
    expect(
      screen.getByRole("heading", {
        name: /review mappings with source evidence/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText("Patient information")).toBeInTheDocument()
    expect(screen.getByText("Sender/client information")).toBeInTheDocument()
    expect(screen.getByText("Coverage and guarantor")).toBeInTheDocument()
    expect(screen.getByText("Lab orders")).toBeInTheDocument()
    expect(screen.getByText("Warnings and missing fields")).toBeInTheDocument()
    expect(screen.getAllByText("patient.name").length).toBeGreaterThan(0)
    expect(screen.getAllByText("PID-5.1").length).toBeGreaterThan(0)
    expect(screen.getAllByText("patient-name").length).toBeGreaterThan(0)
  })

  it("shows a blocking error for invalid HL7 input", async () => {
    const user = userEvent.setup()
    render(<App />)

    const messageInput = screen.getByLabelText(/editable hl7 message/i)
    await user.clear(messageInput)
    await user.type(messageInput, "PID|1||12345^^^MR||DOE^JANE")
    await user.click(screen.getByRole("button", { name: /parse message/i }))

    expect(screen.getByText(/review blocked/i)).toBeInTheDocument()
    expect(
      screen.getByText(/hl7 message must start with an msh segment/i),
    ).toBeInTheDocument()
  })

  it("updates review status from the guided review controls", async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole("button", { name: /parse message/i }))
    await user.click(getActionButton("Confirm"))

    await waitFor(() => {
      expect(screen.getAllByText("Confirmed").length).toBeGreaterThan(0)
    })

    await user.click(getActionButton("Unavailable"))

    await waitFor(() => {
      expect(
        screen.getAllByText("Unavailable in source").length,
      ).toBeGreaterThan(0)
    })
  })

  it("selects an alternate HL7 source for a name part and reruns the mapping", async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole("button", { name: /parse message/i }))
    await user.click(
      screen.getByRole("button", { name: /select patient name/i }),
    )

    const sourceOption = getSourceOption("PID-5.2")

    await user.click(
      within(sourceOption).getByRole("button", { name: /given/i }),
    )

    expect(screen.getAllByText("Mapping changed").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Elena").length).toBeGreaterThan(0)
  })

  it("maps person-name parts from different PID fields", async () => {
    const user = userEvent.setup()
    render(<App />)

    const customMessage = sampleHl7Message.replace(
      /^PID.*$/m,
      "PID|1|Maria|MRN-104892^^^NORTHSTAR_LAB^MR||Lopez^Elena||19870514|F|||742 Evergreen Ave^^Los Angeles^CA^90017^USA||^PRN^PH^^^213^5550142",
    )
    const messageInput = screen.getByLabelText(/editable hl7 message/i)

    fireEvent.change(messageInput, { target: { value: customMessage } })
    await user.click(screen.getByRole("button", { name: /parse message/i }))
    await user.click(
      screen.getByRole("button", { name: /select patient name/i }),
    )

    const middleSourceOption = getSourceOption("PID-2.1")

    await user.click(
      within(middleSourceOption).getByRole("button", { name: /middle/i }),
    )

    await waitFor(() => {
      expect(screen.getAllByText("Mapping changed").length).toBeGreaterThan(0)
      expect(screen.getAllByText(/"middle":"Maria"/).length).toBeGreaterThan(0)
    })

    const storedSnapshot = window.localStorage.getItem(
      "hl7-data-mapper:demo-storage:v1",
    )

    expect(storedSnapshot).toContain('"path":"PID-2.1"')
    expect(storedSnapshot).toContain('"role":"middle"')
    expect(storedSnapshot).not.toContain("MSH|")
    expect(storedSnapshot).not.toContain("PID|")
  })

  it("persists draft mapping metadata without storing raw HL7 content", async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole("button", { name: /parse message/i }))
    await user.click(getActionButton("Confirm"))

    await waitFor(() => {
      const storedSnapshot = window.localStorage.getItem(
        "hl7-data-mapper:demo-storage:v1",
      )

      expect(storedSnapshot).toContain('"draftProfiles"')
      expect(storedSnapshot).toContain('"reviewStatus":"confirmed"')
      expect(storedSnapshot).not.toContain("MSH|")
      expect(storedSnapshot).not.toContain("PID|")
    })
  })

  it("clears browser-stored demo changes when reset is clicked", async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole("button", { name: /parse message/i }))
    await user.click(getActionButton("Confirm"))
    await user.click(screen.getByRole("button", { name: /reset demo draft/i }))

    await waitFor(() => {
      const storedSnapshot = window.localStorage.getItem(
        "hl7-data-mapper:demo-storage:v1",
      )

      expect(storedSnapshot).toContain('"draftProfiles":[]')
      expect(storedSnapshot).toContain('"reviewDecisions":[]')
      expect(storedSnapshot).toContain('"correctionIntents":[]')
    })
  })
})

function getActionButton(label: string): HTMLButtonElement {
  const button = screen
    .getAllByText(label)
    .map((element) => element.closest("button"))
    .find(
      (element): element is HTMLButtonElement =>
        element instanceof HTMLButtonElement,
    )

  if (!button) {
    throw new Error(`Expected ${label} action button.`)
  }

  return button
}

function getSourceOption(path: string): HTMLElement {
  const sourceOption = screen
    .getAllByText(path)
    .map((element) => element.closest<HTMLElement>("[data-source-option]"))
    .find((element): element is HTMLElement => element instanceof HTMLElement)

  if (!sourceOption) {
    throw new Error(`Expected ${path} source option.`)
  }

  return sourceOption
}
