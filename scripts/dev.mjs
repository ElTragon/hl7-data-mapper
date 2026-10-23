import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const pnpmPath = process.env.npm_execpath
if (!pnpmPath) {
  throw new Error("Start the development workspace with pnpm dev.")
}

const cwd = fileURLToPath(new URL("../", import.meta.url))
const windows = process.platform === "win32"
const windowsSupervisor = fileURLToPath(
  new URL("./dev-windows.ps1", import.meta.url),
)
const viteArgs = process.argv.slice(2)
if (viteArgs[0] === "--") viteArgs.shift()

const children = []
let stopping = false

function stopTree(child, signal) {
  if (!child.pid) return
  if (windows) {
    // The supervisor owns a kill-on-close Job Object. Killing it also stops
    // descendants whose immediate parent has already exited.
    child.kill()
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
  const command = windows ? "powershell.exe" : process.execPath
  const commandArgs = windows
    ? [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        windowsSupervisor,
        "-Payload",
        Buffer.from(
          JSON.stringify({
            executable: process.execPath,
            args: [pnpmPath, ...args],
          }),
        ).toString("base64"),
      ]
    : [pnpmPath, ...args]
  const child = spawn(command, commandArgs, {
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
