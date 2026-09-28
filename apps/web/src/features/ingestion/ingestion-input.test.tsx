import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Hl7IngestionPanel } from "./hl7-ingestion-panel"
import { exceedsMessageLimit, MAX_MESSAGE_BYTES } from "./input-limits"
import sample from "../../../../../fixtures/valid/oml-o21-basic.hl7?raw"

function deferred<T = string>() {
  let resolve!: (text: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function upload(read: () => Promise<string>, size = 10) {
  const file = new File(["synthetic"], "sample.hl7")
  Object.defineProperties(file, {
    text: { value: read },
    size: { value: size },
  })
  fireEvent.change(screen.getByLabelText("Upload HL7 file"), {
    target: { files: [file] },
  })
  return file
}
function mockDownloadApis() {
  const createObjectURL = vi.fn(() => "blob:synthetic-report")
  const revokeObjectURL = vi.fn()
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    },
  )
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {})
  return { createObjectURL, revokeObjectURL, click }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const editor = () => screen.getByLabelText("Editable HL7 message")
const parse = () => screen.getByRole("button", { name: "Parse message" })

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("ingestion input", () => {
  it("uses UTF-8 bytes with an inclusive 1 MiB boundary", () => {
    expect(exceedsMessageLimit("a".repeat(MAX_MESSAGE_BYTES))).toBe(false)
    expect(exceedsMessageLimit("a".repeat(MAX_MESSAGE_BYTES + 1))).toBe(true)
    expect(exceedsMessageLimit("é".repeat(MAX_MESSAGE_BYTES / 2))).toBe(false)
    expect(exceedsMessageLimit("é".repeat(MAX_MESSAGE_BYTES / 2) + "a")).toBe(
      true,
    )
  })
  it("preserves oversized edits and clears stale review", () => {
    render(<Hl7IngestionPanel />)
    fireEvent.click(parse())
    const text = "é".repeat(MAX_MESSAGE_BYTES / 2 + 1)
    fireEvent.change(editor(), { target: { value: text } })
    expect(editor()).toHaveValue(text)
    expect(parse()).toBeDisabled()
    expect(
      screen.queryByRole("button", { name: "Download report ZIP" }),
    ).not.toBeInTheDocument()
    fireEvent.change(editor(), { target: { value: sample } })
    expect(parse()).toBeEnabled()
  })
  it("only accepts the latest file and clears review while reading", async () => {
    render(<Hl7IngestionPanel />)
    fireEvent.click(parse())
    const a = deferred(),
      b = deferred()
    upload(() => a.promise)
    expect(parse()).toBeDisabled()
    expect(
      screen.queryByRole("button", { name: "Download report ZIP" }),
    ).not.toBeInTheDocument()
    upload(() => b.promise)
    await act(async () => b.resolve("new message"))
    await act(async () => a.resolve("old message"))
    expect(editor()).toHaveValue("new message")
    expect(parse()).toBeEnabled()
  })
  it("a superseded rejection cannot clear the current loading state", async () => {
    render(<Hl7IngestionPanel />)
    const a = deferred(),
      b = deferred()
    upload(() => a.promise)
    upload(() => b.promise)
    await act(async () => a.reject(new Error("old failure")))
    expect(parse()).toBeDisabled()
    expect(screen.queryByText(/Could not read/)).not.toBeInTheDocument()
    await act(async () => b.resolve(sample))
    expect(parse()).toBeEnabled()
  })
  it.each(["edit", "sample", "oversized replacement"])(
    "invalidates a pending read on %s",
    async (action) => {
      render(<Hl7IngestionPanel />)
      const a = deferred()
      upload(() => a.promise)
      if (action === "edit")
        fireEvent.change(editor(), { target: { value: "manual" } })
      if (action === "sample")
        fireEvent.click(
          screen.getByRole("button", { name: "Load synthetic sample" }),
        )
      if (action === "oversized replacement") {
        const read = vi.fn()
        upload(read, MAX_MESSAGE_BYTES + 1)
        expect(read).not.toHaveBeenCalled()
      }
      await act(async () => a.resolve("stale"))
      expect(editor()).toHaveValue(action === "edit" ? "manual" : sample.trim())
      expect(parse()).toBeEnabled()
    },
  )
  it("preserves text after failure and permits retrying the same file", async () => {
    render(<Hl7IngestionPanel />)
    const a = deferred()
    const read = vi
      .fn()
      .mockReturnValueOnce(a.promise)
      .mockResolvedValueOnce(sample)
    const file = upload(read)
    await act(async () => a.reject(new Error("failure")))
    expect(editor()).toHaveValue(sample.trim())
    expect(screen.getByText(/Could not read/)).toBeInTheDocument()
    expect(parse()).toBeEnabled()
    await act(async () =>
      fireEvent.change(screen.getByLabelText("Upload HL7 file"), {
        target: { files: [file] },
      }),
    )
    expect(read).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/Could not read/)).not.toBeInTheDocument()
    fireEvent.click(parse())
    expect(
      screen.getByText("Message can continue to review"),
    ).toBeInTheDocument()
  })
  it("accepts an upload exactly at the byte limit", async () => {
    render(<Hl7IngestionPanel />)
    const text = sample.trim().padEnd(MAX_MESSAGE_BYTES, " ")
    await act(async () => upload(async () => text, MAX_MESSAGE_BYTES))
    expect(editor()).toHaveValue(text)
    expect(parse()).toBeEnabled()
    fireEvent.click(parse())
    expect(
      screen.getByText("Message can continue to review"),
    ).toBeInTheDocument()
  })
  it("downloads a report when the input remains unchanged", async () => {
    const { createObjectURL, revokeObjectURL, click } = mockDownloadApis()
    vi.spyOn(crypto.subtle, "digest").mockResolvedValue(new ArrayBuffer(32))
    render(<Hl7IngestionPanel />)
    fireEvent.click(parse())
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Download report ZIP" }),
      )
    })
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(expect.any(Blob))
    expect(click).toHaveBeenCalledTimes(1)
    expect(click.mock.instances[0]).toHaveAttribute(
      "href",
      "blob:synthetic-report",
    )
    expect(click.mock.instances[0]).toHaveAttribute(
      "download",
      "default-oml-o21.zip",
    )
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      "blob:synthetic-report",
    )
    expect(
      screen.getByText("Report ZIP generated successfully."),
    ).toBeInTheDocument()
    expect(screen.queryByText("Report issue")).not.toBeInTheDocument()
  })
  it("discards an in-flight report after input replacement", async () => {
    const { createObjectURL, revokeObjectURL, click } = mockDownloadApis()
    render(<Hl7IngestionPanel />)
    fireEvent.click(parse())
    const digest = deferred<ArrayBuffer>()
    vi.spyOn(crypto.subtle, "digest")
      .mockResolvedValue(new ArrayBuffer(32))
      .mockReturnValueOnce(digest.promise)
    fireEvent.click(screen.getByRole("button", { name: "Download report ZIP" }))
    fireEvent.change(editor(), { target: { value: "replacement" } })
    await act(async () => {
      digest.resolve(new ArrayBuffer(32))
    })
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    expect(screen.queryByText("Report issue")).not.toBeInTheDocument()
    expect(
      screen.queryByText("Report ZIP generated successfully."),
    ).not.toBeInTheDocument()
  })
  it("checks decoded upload size before replacing text", async () => {
    render(<Hl7IngestionPanel />)
    await act(async () => upload(async () => "é".repeat(MAX_MESSAGE_BYTES)))
    expect(editor()).toHaveValue(sample.trim())
    expect(screen.getByText(/Message exceeds/)).toBeInTheDocument()
  })
  it("ignores completion after unmount", async () => {
    const view = render(<Hl7IngestionPanel />)
    const a = deferred()
    upload(() => a.promise)
    view.unmount()
    await act(async () => a.resolve(sample))
    expect(localStorage.length).toBe(0)
  })
  it("blocks review of concatenated messages and recovers after editing", () => {
    render(<Hl7IngestionPanel />)
    fireEvent.change(editor(), { target: { value: sample + "\r" + sample } })
    fireEvent.click(parse())
    expect(screen.getByText("Review blocked")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Download report ZIP" }),
    ).toBeDisabled()
    fireEvent.change(editor(), { target: { value: sample } })
    fireEvent.click(parse())
    expect(
      screen.getByText("Message can continue to review"),
    ).toBeInTheDocument()
  })
})
