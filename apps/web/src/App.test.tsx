import { render, screen } from "@testing-library/react"
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
    expect(screen.getByText(/synthetic data only/i)).toBeInTheDocument()
  })
})
