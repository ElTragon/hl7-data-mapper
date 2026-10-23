import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import test from "node:test"

const launcher = fileURLToPath(new URL("./dev.mjs", import.meta.url))
const options = {
  timeout: 15_000,
  skip: process.platform === "win32" ? "POSIX process-group checks" : false,
}

// Exercise real process trees without starting compilers or opening a port.
const fakePnpm = `
import { spawn } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import path from "node:path"
const args = process.argv.slice(2)
const role = args.includes("web") ? "web" : "packages"
const dir = process.env.TOOLING_TEST_DIR
const child = spawn(process.execPath, ["-e", \`
  const fs = require("node:fs")
  const path = require("node:path")
  const dir = process.env.TOOLING_TEST_DIR
  process.on("SIGTERM", () => {
    fs.writeFileSync(path.join(dir, "stopped-\${role}"), "stopped")
    if (process.env.TOOLING_STUBBORN !== "1") process.exit(0)
  })
  fs.writeFileSync(path.join(dir, "ready-\${role}"), "ready")
  setInterval(() => {}, 1000)
\`], { stdio: "inherit" })
writeFileSync(path.join(dir, role + ".json"), JSON.stringify({
  args, cwd: process.cwd(), pid: process.pid, descendant: child.pid,
}))
setInterval(() => {
  if (existsSync(path.join(dir, "fail-" + role))) process.exit(17)
}, 25)
`

async function waitFor(check) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(25)
  }
  assert.fail("Timed out waiting for development process state")
}

async function exists(file) {
  try {
    await readFile(file)
    return true
  } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === "ESRCH") return false
    throw error
  }
}

async function start(t, args, { stubborn = false } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "hl7-dev-test-"))
  const cli = path.join(dir, "pnpm.mjs")
  await writeFile(cli, fakePnpm)
  const child = spawn(process.execPath, [launcher, ...args], {
    env: {
      ...process.env,
      npm_execpath: cli,
      TOOLING_TEST_DIR: dir,
      TOOLING_STUBBORN: stubborn ? "1" : "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  child.stdout.on("data", (chunk) => (output += chunk))
  child.stderr.on("data", (chunk) => (output += chunk))
  const exit = once(child, "exit")
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM")
    }
    await exit
    // Clean up even when a regression makes a descendant outlive the launcher.
    for (const role of ["packages", "web"]) {
      const record = path.join(dir, `${role}.json`)
      if (!(await exists(record))) continue
      const { pid, descendant } = JSON.parse(await readFile(record, "utf8"))
      for (const id of [descendant, pid]) {
        if (alive(id)) process.kill(id, "SIGKILL")
      }
    }
    await rm(dir, { recursive: true, force: true })
  })
  await waitFor(async () => {
    assert.equal(child.exitCode, null, output)
    return (
      (await exists(path.join(dir, "ready-web"))) &&
      (await exists(path.join(dir, "ready-packages")))
    )
  })
  const records = await Promise.all(
    ["packages", "web"].map(async (role) =>
      JSON.parse(await readFile(path.join(dir, `${role}.json`), "utf8")),
    ),
  )
  return {
    child,
    dir,
    records,
    async expectExit(code) {
      const [actual, signal] = await exit
      assert.equal(actual, code, output)
      assert.equal(signal, null, output)
      for (const { pid, descendant } of records) {
        await waitFor(() => !alive(pid) && !alive(descendant))
      }
    },
  }
}

for (const separator of [false, true]) {
  test(
    `forwards Vite arguments only to web (separator: ${separator})`,
    options,
    async (t) => {
      const args = [
        "--host",
        "127.0.0.1",
        "--port",
        "5191",
        "--strictPort",
        "--base",
        "/space path/",
      ]
      const run = await start(t, separator ? ["--", ...args] : args)
      assert.deepEqual(run.records[0].args, [
        "--parallel",
        "--filter",
        "./packages/*",
        "dev",
      ])
      assert.deepEqual(run.records[1].args, ["--filter", "web", "dev", ...args])
      assert.equal(run.records[0].cwd, path.dirname(path.dirname(launcher)))
      run.child.kill("SIGINT")
      await run.expectExit(130)
    },
  )
}

for (const role of ["web", "packages"]) {
  test(`stops both process trees when ${role} fails`, options, async (t) => {
    const run = await start(t, [])
    await writeFile(path.join(run.dir, `fail-${role}`), "fail")
    await run.expectExit(17)
  })
}

test("SIGTERM stops both process trees", options, async (t) => {
  const run = await start(t, [])
  run.child.kill("SIGTERM")
  await run.expectExit(143)
})

test(
  "repeated SIGINT still kills SIGTERM-resistant descendants",
  options,
  async (t) => {
    const run = await start(t, [], { stubborn: true })
    run.child.kill("SIGINT")
    for (const role of ["packages", "web"]) {
      await waitFor(() => exists(path.join(run.dir, `stopped-${role}`)))
    }
    run.child.kill("SIGINT")
    await run.expectExit(130)
  },
)

test(
  "kills SIGTERM-resistant descendants after a parent exits",
  options,
  async (t) => {
    const run = await start(t, [], { stubborn: true })
    await writeFile(path.join(run.dir, "fail-packages"), "fail")
    await run.expectExit(17)
  },
)
