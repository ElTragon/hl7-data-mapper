import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import App from "./App"

describe("App", () => {
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

    expect(screen.getByText("OML^O21^OML_O21")).toBeInTheDocument()
    expect(screen.getByText("2.5.1")).toBeInTheDocument()
    expect(
      screen.getByText(/message can continue to review/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /download report zip/i }),
    ).toBeEnabled()
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
})
