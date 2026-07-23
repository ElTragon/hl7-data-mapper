import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CollectedValue } from "./collected-value"

describe("CollectedValue", () => {
  it("renders nested values as readable rows", () => {
    render(
      <CollectedValue
        density="comfortable"
        value={{
          street: "742 Evergreen Ave",
          city: "Los Angeles",
        }}
      />,
    )

    expect(screen.getByText("Street")).toBeInTheDocument()
    expect(screen.getByText("742 Evergreen Ave")).toBeInTheDocument()
    expect(screen.getByText("City")).toBeInTheDocument()
    expect(screen.getByText("Los Angeles")).toBeInTheDocument()
  })

  it("renders empty values as unavailable", () => {
    render(<CollectedValue density="compact" value={{ name: "" }} />)

    expect(screen.getByText("Unavailable")).toBeInTheDocument()
  })
})
