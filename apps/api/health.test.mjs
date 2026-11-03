import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

// Exercise the real local Worker runtime and checked-in Wrangler bindings.
process.env.WRANGLER_SEND_METRICS = "false"
const { unstable_dev } = await import("wrangler")

test(
  "local API starts and serves its health contract",
  { timeout: 60_000 },
  async (t) => {
    const worker = await unstable_dev(
      fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      {
        config: fileURLToPath(new URL("./wrangler.jsonc", import.meta.url)),
        local: true,
        ip: "127.0.0.1",
        port: 0,
        inspectorPort: 0,
        persist: false,
        logLevel: "error",
        experimental: { disableExperimentalWarning: true, watch: false },
      },
    )
    t.after(() => worker.stop())
    const origin = `http://${worker.address}:${worker.port}`
    const response = await fetch(`${origin}/health`, {
      signal: AbortSignal.timeout(10_000),
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.equal(response.headers.get("x-content-type-options"), "nosniff")
    assert.deepEqual(await response.json(), {
      ok: true,
      service: "hl7-data-mapper-api",
      demoDataPolicy: "synthetic-only",
      reportMaxBytes: 5_242_880,
    })
    const missing = await fetch(`${origin}/missing`, {
      signal: AbortSignal.timeout(10_000),
    })
    assert.equal(missing.status, 404)
    assert.equal((await missing.json()).error, "not_found")
  },
)
