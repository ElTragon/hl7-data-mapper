import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const pnpmPath = process.env.npm_execpath
if (!pnpmPath) {
  throw new Error("Start the development workspace with pnpm dev.")
}

const cwd = fileURLToPath(new URL("../", import.meta.url))
const windows = process.platform === "win32"
const viteArgs = process.argv.slice(2)
if (viteArgs[0] === "--") viteArgs.shift()

const children = []
let stopping = false

function stopTree(child, signal) {
  if (!child.pid) return
  if (windows) {
    // pnpm launches further processes, so terminating its PID alone is not enough.
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    }).on("error", (error) => {
      console.error(error.message)
      process.exitCode = 1
    })
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch (error) {
    if (error.code !== "ESRCH") throw error
  }
}

function stop(exitCode) {
  if (stopping) return
  stopping = true
  process.exitCode = exitCode
  for (const child of children) stopTree(child, "SIGTERM")
  if (!windows) {
    // Keep the launcher alive until stubborn descendants have also been stopped,
    // even if their pnpm parent exits before them.
    setTimeout(() => {
      for (const child of children) stopTree(child, "SIGKILL")
    }, 1000)
  }
}

// Repeated signals must not bypass the pending SIGKILL fallback.
process.on("SIGINT", () => stop(130))
process.on("SIGTERM", () => stop(143))

for (const args of [
  ["--parallel", "--filter", "./packages/*", "dev"],
  ["--filter", "web", "dev", ...viteArgs],
]) {
  const child = spawn(process.execPath, [pnpmPath, ...args], {
    cwd,
    stdio: "inherit",
    detached: !windows,
  })
  children.push(child)
  child.once("error", (error) => {
    console.error(error.message)
    stop(1)
  })
  child.once("exit", (code) => stop(code ?? 1))
}
