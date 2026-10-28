import { expect, it } from "vitest"
import { normalizedPathKind } from "./normalized-path-kind.js"

it.each([
  ["labOrders", "array"],
  ["patient.addresses", "array"],
  ["labOrders[0].orderingProvider", "object"],
  ["labOrders[0].orderingProvider.given", "string"],
  ["labOrders[0].specimens[1].sequence", "number"],
  ["patient.addresses[0].city", "string"],
  ["labOrders[0].unknown", "unknown"],
])("resolves %s as %s", (path, kind) => {
  expect(normalizedPathKind(path)).toBe(kind)
})
