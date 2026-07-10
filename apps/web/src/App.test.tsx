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

    const customMessage = sampleHl7Message.replace(
      /^PID.*$/m,
      "PID|1||||Lopez^Elena^M||19870514|F",
    )
    const messageInput = screen.getByLabelText(/editable hl7 message/i)

    fireEvent.change(messageInput, { target: { value: customMessage } })
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

  it("does not restore unavailable status onto a field with an extracted value", async () => {
    const user = userEvent.setup()

    window.localStorage.setItem(
      "hl7-data-mapper:demo-storage:v1",
      JSON.stringify({
        storageVersion: 1,
        mode: "public_demo",
        draftProfiles: [],
        reviewDecisions: [
          {
            fieldId: "patient-name",
            normalizedPath: "patient.name",
            reviewStatus: "unavailable",
            updatedAt: "2026-07-10T00:00:00-07:00",
          },
        ],
        correctionIntents: [],
        demoAuditEvents: [],
        updatedAt: "2026-07-10T00:00:00-07:00",
      }),
    )

    render(<App />)

    await user.click(screen.getByRole("button", { name: /parse message/i }))
    await user.click(
      screen.getByRole("button", { name: /select patient name/i }),
    )

    const patientNameCard = getFieldCardByText(/^Patient name$/)

    expect(
      within(patientNameCard).queryByText("Unavailable in source"),
    ).not.toBeInTheDocument()
    expect(
      within(patientNameCard).getByText("Needs review"),
    ).toBeInTheDocument()
    expect(within(patientNameCard).getByText("Lopez")).toBeInTheDocument()
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
      expect(screen.getAllByText("Middle").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Maria").length).toBeGreaterThan(0)
    })

    const storedSnapshot = window.localStorage.getItem(
      "hl7-data-mapper:demo-storage:v1",
    )

    expect(storedSnapshot).toContain('"path":"PID-2.1"')
    expect(storedSnapshot).toContain('"role":"middle"')
    expect(storedSnapshot).not.toContain("MSH|")
    expect(storedSnapshot).not.toContain("PID|")
  })

  it("renders composite collected values as readable field rows", async () => {
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
      screen.getByRole("button", { name: /select patient addresses/i }),
    )

    expect(screen.getAllByText("Street").length).toBeGreaterThan(0)
    expect(screen.getAllByText("742 Evergreen Ave").length).toBeGreaterThan(0)
    expect(screen.getAllByText("City").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Los Angeles").length).toBeGreaterThan(0)
    expect(screen.queryByText(/"street":/)).not.toBeInTheDocument()
  })

  it("shows the parsed MRN as a readable identifier value", async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole("button", { name: /parse message/i }))
    await user.click(
      screen.getByRole("button", { name: /select patient mrn/i }),
    )

    expect(screen.getAllByText("MRN-104892").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Assigning Authority").length).toBeGreaterThan(0)
    expect(screen.getAllByText("NORTHSTAR_LAB").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Type").length).toBeGreaterThan(0)
    expect(screen.getAllByText("MR").length).toBeGreaterThan(0)
  })

  it("labels benign blank optional components as safe to ignore", async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole("button", { name: /parse message/i }))
    await user.click(
      screen.getByRole("button", { name: /warnings and missing fields/i }),
    )

    expect(screen.getAllByText("PID-5.4").length).toBeGreaterThan(0)
    expect(screen.getAllByText("PID-5.5").length).toBeGreaterThan(0)
    expect(screen.getAllByText("PID-13.5").length).toBeGreaterThan(0)
    expect(screen.getAllByText("TQ1-8").length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/Expected patient name suffix at PID-5\.4/i).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        /usually safe to ignore unless this client sends suffixes/i,
      ).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText("Safe to ignore").length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/this source slot is blank or absent/i).length,
    ).toBeGreaterThan(0)
  })

  it("shows source expectation details in the inspector", async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole("button", { name: /parse message/i }))
    await user.click(
      screen.getByRole("button", { name: /select patient name/i }),
    )

    const suffixSourceCard = getSourceReadCardByPath("PID-5.4")

    expect(
      within(suffixSourceCard).getByText("Patient name suffix"),
    ).toBeInTheDocument()
    expect(within(suffixSourceCard).getByText("Optional")).toBeInTheDocument()
    expect(
      within(suffixSourceCard).getByText(/Example: Jr, Sr, III/i),
    ).toBeInTheDocument()
    expect(
      within(suffixSourceCard).getByText(/No suffix was present in PID-5\.4/i),
    ).toBeInTheDocument()
  })

  it("does not label missing patient family name as safe to ignore", async () => {
    const user = userEvent.setup()
    render(<App />)

    const customMessage = sampleHl7Message.replace(
      /^PID.*$/m,
      "PID|1||MRN-104892^^^NORTHSTAR_LAB^MR||^Elena^M||19870514|F|||742 Evergreen Ave^^Los Angeles^CA^90017^USA||^PRN^PH^^^213^5550142",
    )
    const messageInput = screen.getByLabelText(/editable hl7 message/i)

    fireEvent.change(messageInput, { target: { value: customMessage } })
    await user.click(screen.getByRole("button", { name: /parse message/i }))
    await user.click(
      screen.getByRole("button", { name: /warnings and missing fields/i }),
    )

    const familyNameCard = getFieldCardByText(
      /Expected patient family name at PID-5\.1/,
    )

    expect(within(familyNameCard).getByText("Review")).toBeInTheDocument()
    expect(
      within(familyNameCard).queryByText("Safe to ignore"),
    ).not.toBeInTheDocument()
    expect(
      within(familyNameCard).getByText(/client-specific mapping issue/i),
    ).toBeInTheDocument()
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

function getFieldCardByText(text: RegExp): HTMLElement {
  const fieldCard = screen
    .getAllByText(text)
    .map((element) => element.closest<HTMLElement>("[role='button']"))
    .find((element): element is HTMLElement => element instanceof HTMLElement)

  if (!fieldCard) {
    throw new Error(`Expected review field card matching ${text}.`)
  }

  return fieldCard
}

function getSourceReadCardByPath(path: string): HTMLElement {
  const sourceReadCard = screen
    .getAllByText(path)
    .map((element) => element.closest<HTMLElement>(".rounded-md"))
    .find((element): element is HTMLElement => element instanceof HTMLElement)

  if (!sourceReadCard) {
    throw new Error(`Expected source read card for ${path}.`)
  }

  return sourceReadCard
}
