# Workspace, stack, and tooling

This is the contributor reference for how the repository is assembled and
checked. For the user journey, start with [message to report](message-to-report.md);
for the package responsibilities, see [project structure](project-structure.md).
The reasons below are architectural inferences from the current manifests,
scripts, and code, rather than a record of the original authors' decisions.

## One repository, two apps, four packages

The [workspace file](../pnpm-workspace.yaml) includes `apps/*` and
`packages/*`. Every internal package dependency uses `workspace:*` in its
manifest. The dependency graph is:

```text
apps/web                 → contracts, hl7-parser, mapping-engine, report-generator
apps/api                 → contracts
packages/mapping-engine  → contracts, hl7-parser
packages/report-generator→ contracts
packages/contracts       → no workspace package
packages/hl7-parser      → no workspace package
```

An arrow means a declared package dependency, not a network request. The
[web app](../apps/web/package.json) is the composition point for today's
browser-only workflow. [Mapping](../packages/mapping-engine/package.json)
can use parser structure and shared contracts, while
[report generation](../packages/report-generator/package.json) accepts
contract-shaped data without importing mapping or React. The
[Worker](../apps/api/package.json) is separate from the browser flow.
This direction makes each package testable at its own boundary and avoids
cycles between parser, mapping, and report code.

### Why pnpm here?

The [root manifest](../package.json) pins `pnpm@11.10.0`; [`.nvmrc`](../.nvmrc)
pins Node 22.13.1, and the root engine range accepts Node 22 from that
version onward. The single [lockfile](../pnpm-lock.yaml) records all workspace
dependencies. In this repository, pnpm provides three concrete features:

1. `workspace:*` binds an internal import to the matching local package. A
   registry package with the same name cannot silently substitute for it.
2. `--filter` selects an app or the shared package set, so local development
   and focused checks use the same root workspace.
3. Recursive `-r` scripts run package tasks in dependency order by default.
   This matters because downstream packages consume compiled upstream output.

`pnpm install --frozen-lockfile` is used in [CI](../.github/workflows/ci.yml),
so dependency changes should update the lockfile intentionally. The workspace
file also pins a few transitive dependency overrides and allows build scripts
for `esbuild`, `sharp`, and `workerd`; see its comments for the current reasons.
These facts explain why pnpm is useful _in this checkout_. They do not establish
a measured speed advantage over other package managers.

## What the stack is doing

| Tool                                 | Active use in this repository                                                                                        | Boundary to remember                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| TypeScript 6                         | Strict checking across browser, Worker, and packages; declarations and source maps for shared packages.              | Types do not validate saved JSON or a report input at runtime.                                           |
| Zod 4                                | Runtime schemas in [contracts](../packages/contracts/src/index.ts), used at profile, storage, and export boundaries. | A valid schema shape can still describe an action the mapping executor has not implemented.              |
| React 19 and Vite 8                  | Interactive browser workspace; Vite loads the synthetic fixture with `?raw` and bundles the UI.                      | The current message path runs locally in the browser.                                                    |
| TanStack Router                      | File-based route generation; the running app currently has one `/` route.                                            | More routes are infrastructure capacity, not current product workflows.                                  |
| TanStack Query                       | A [QueryClient provider](../apps/web/src/providers/app-providers.tsx) is mounted.                                    | No current ingestion/review/export path uses queries or calls the Worker.                                |
| Tailwind 4, shadcn/Radix, Lucide     | Styles, reusable UI primitives, and icons in the web app.                                                            | [Components](../apps/web/src/components/ui) and [CSS](../apps/web/src/index.css) live in this repo.      |
| `fflate`                             | The [report generator](../packages/report-generator/src/build-report-zip.ts) compresses report files into a ZIP.     | The browser creates and downloads the ZIP; the Worker does not.                                          |
| Cloudflare Worker and Wrangler       | Local/API scaffold with `GET /health`.                                                                               | The configured D1 ID is a placeholder and no D1 reads/writes run.                                        |
| Vitest, Playwright, ESLint, Prettier | Package/web tests, browser journeys, web lint, and repository formatting.                                            | The commands below have different scopes; `pnpm test` does not include Playwright or the API smoke test. |

The web manifest also lists React Hook Form and its Zod resolver, but current
application source does not call them. Treat dependency presence as a build
fact, not proof that a feature uses it. See [web entry](../apps/web/src/main.tsx),
[route](../apps/web/src/routes/index.tsx), and [Vite config](../apps/web/vite.config.ts).

## Why shared packages build before the web app

The four shared packages export `./dist/index.js` for runtime and
`./dist/index.d.ts` for TypeScript. For example, see the
[mapping package manifest](../packages/mapping-engine/package.json). Their
production `tsconfig.json` files emit JavaScript, declarations, declaration
maps, and source maps into `dist`; they exclude package tests and test helpers.
Their separate `tsconfig.test.json` files typecheck source and tests without
emitting. [Mapping's TypeScript references](../packages/mapping-engine/tsconfig.json)
point to contracts and parser; report generation references contracts. The
[web TypeScript config](../apps/web/tsconfig.json) checks browser source and
Node-side Vite/test configuration separately. The
[Worker config](../apps/api/tsconfig.json) checks WebWorker types without
emitting a Node build.

The dependency path explains the build order:

```text
contracts ───────────────> mapping-engine ─────> web
hl7-parser ──────────────> mapping-engine ─────> web
contracts ───────────────> report-generator ───> web
contracts ───────────────> api
```

The [root `build:packages` script](../package.json) builds the package set
recursively. `pnpm dev` invokes it first, then starts development processes.
Without compiled `dist` outputs, Vite can fail to resolve a workspace import
even when the TypeScript source file exists.

## Running the app locally

From the repository root:

```bash
nvm use
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm dev
```

Install the pinned Node version first if it is not already available. Vite
prints the web URL. The root [`scripts/dev.mjs`](../scripts/dev.mjs) starts
TypeScript watchers for the packages alongside Vite. A package edit rebuilds
its `dist` output; click **Parse message** again to run changed parser or
mapping code in the current browser session. If you changed default profile
rules, **Reset demo draft** replaces an older browser-stored draft with new
defaults. The launcher forwards command-line arguments to Vite only:

```bash
pnpm dev --host 127.0.0.1 --port 5174 --strictPort
```

The launcher stops peer processes when one exits. On macOS/Linux it signals
child process groups, with a later kill for stubborn descendants. On Windows,
the [PowerShell supervisor](../scripts/dev-windows.ps1) owns a Job Object so
its process tree is cleaned up. The
[tooling tests](../scripts/dev.test.mjs) exercise argument forwarding and
cleanup; CI runs them on both Ubuntu and Windows.

For a Vite-only process, use:

```bash
pnpm build:packages
pnpm --filter web dev
```

This path has no package watchers. Rebuild packages after a shared-package
change. The Worker has a separate `pnpm dev:api` command; web `pnpm dev` does
not start it.

## Checks and what they cover

| Root command                        | What it checks                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm audit --audit-level moderate` | Dependency advisories at moderate severity and above; requires access to the package registry.           |
| `pnpm typecheck`                    | Builds packages, typechecks package source/tests/helpers, then API and web source/config/tests.          |
| `pnpm lint`                         | Runs each workspace project's available lint script; currently the web app has the ESLint script.        |
| `pnpm test`                         | Launcher tests, then package and web Vitest suites.                                                      |
| `pnpm test:coverage`                | Web product-owned source coverage under the thresholds in [Vitest config](../apps/web/vitest.config.ts). |
| `pnpm build`                        | Recursive production builds/checks for shared packages, web, and API.                                    |
| `pnpm test:api`                     | Starts a local Worker, checks `/health` and 404 behavior, then stops it.                                 |
| `pnpm format:check`                 | Prettier check across the repository.                                                                    |
| `pnpm test:e2e`                     | Builds and runs Playwright against a local production preview of the web app.                            |

The main checks and browser jobs in [CI](../.github/workflows/ci.yml) run for
pull requests and pushes to `main`. The browser job installs Chromium, runs
the [Playwright journeys](../apps/web/tests/e2e/review-workflow.spec.ts), and
retains traces/screenshots/video on failure. To run those journeys locally,
install Chromium once:

```bash
pnpm --filter web exec playwright install chromium
pnpm test:e2e
```

For a focused package test, select the workspace package, for example:

```bash
pnpm --filter @hl7-data-mapper/hl7-parser test
```

Build its dependencies first if a clean checkout has no `dist` output. The
root `pnpm typecheck` is a convenient first check because it builds packages.
Use a focused test during development, then run the root checks before handing
off a change. The [root README](../README.md#check-the-workspace) lists the
CI `checks` sequence.

## Worker status and deployment boundary

[`apps/api`](../apps/api/README.md) is a Cloudflare Worker scaffold. Its
[handler](../apps/api/src/index.ts) returns metadata at `GET /health` and a
JSON 404 for other paths. The [Wrangler config](../apps/api/wrangler.jsonc)
declares `DEMO_DATA_POLICY=synthetic-only`, a report-size value for the health
response, and a D1 binding with a placeholder database ID. The handler does
not ingest messages, generate reports, use that size value as an upload limit,
or access D1. The web app has no API request in its current workflow.

`pnpm deploy:api` is a script for `wrangler deploy`; it is not evidence of a
ready-to-deploy data service. A real D1 binding and the planned API/storage
implementation would be needed before using the Worker for profile metadata.
See [persistence requirements](client-profile-persistence.md) for the intended
configuration-only storage boundary.

## Quick diagnosis when a change seems missing

1. **Workspace import fails:** build packages and check the package's
   `dist/index.js` and `dist/index.d.ts` outputs; package `exports` resolve
   there.
2. **A package edit does not appear in Vite:** confirm the TypeScript watcher
   compiled successfully, then reparse the message. Rebuild manually if you
   started Vite with `pnpm --filter web dev`.
3. **A default rule edit has no effect:** reset the saved demo draft before
   parsing again; the browser prefers a compatible stored draft.
4. **`pnpm test` passes but a browser journey fails:** run `pnpm test:e2e` and
   inspect Playwright failure evidence; E2E is a separate command.
5. **The Worker starts but has no mapping endpoint:** that is its current
   scope. Trace mapping in the web app and packages instead.
