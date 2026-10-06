# HL7 Data Mapper

HL7 Data Mapper is a browser-based workspace for inspecting a synthetic HL7 v2
laboratory-order message, reviewing its extracted fields, correcting mapping
sources, and downloading a report ZIP. It supports the project's OML^O21,
HL7 v2.5.1 application profile; it is not a general HL7 conformance service.

> The public demo is for synthetic data only. Do not upload protected health
> information (PHI).

## What works today

| Area          | Current behavior                                                                                                                                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input         | Paste, edit, or upload one `.hl7` or `.txt` message, or load the bundled synthetic sample. The browser enforces a 1 MiB UTF-8 byte limit.                                                                                                                      |
| Parse and map | Profile checks block malformed or unsupported messages. The built-in client profile maps patient, sender, coverage, guarantor, order, and specimen fields with source evidence.                                                                                |
| Guided review | Confirm fields, record review reasons and notes, or choose a different HL7 source. A source correction updates a draft mapping and reruns extraction.                                                                                                          |
| Local draft   | Browser storage keeps safe draft rules, decisions, corrections, and demo events. It does not keep raw HL7 or extracted patient values. To resume a review after refresh, provide the same message and parse it again.                                          |
| Export        | Download an interim ZIP while review remains open, or a completed ZIP when the completion rules pass. The ZIP contains normalized data, mapping rules, decisions, validation results, a manifest, and a human-readable report; raw HL7 is excluded by default. |
| Worker        | The separate Cloudflare Worker currently exposes `GET /health`. The browser workflow does not call it.                                                                                                                                                         |

Client creation and selection in the UI, publishing profile versions, D1-backed
profile persistence, and server-side ingestion or report generation are planned.
Some schemas and lifecycle helpers for those capabilities already exist in the
shared packages; they are not deployed product workflows.

The current profile's mapped arrays can retain only one configured entry for
repeated addresses, telecom, coverage, or orders in the browser export. The
default composers handle repetitions, but complete repeated-entry export still
needs work; see [mapping execution](docs/mapping-execution.md).

## Run locally

Use Node.js 22.13.1 (`.nvmrc`) and pnpm 11.10.0 (`packageManager` in
`package.json`). If you use nvm, select the pinned Node version, then enable
pnpm through Corepack:

```bash
nvm use
corepack enable pnpm
pnpm --version
pnpm install --frozen-lockfile
pnpm typecheck
pnpm dev
```

If you do not use nvm, install Node.js 22.13.1 before the Corepack step.
`pnpm typecheck` builds the workspace packages required by the web app.
`pnpm dev` starts the web app; Vite prints its local URL. The Worker has a
separate local command and setup notes in [apps/api/README.md](apps/api/README.md).

The web page starts with the bundled synthetic message. Click **Parse message**
to review it, or replace it with another synthetic OML^O21 message. Review
decisions survive a refresh only when the same message is supplied and parsed
again. **Reset demo draft** clears the saved browser review state.

## Check the workspace

Run the same checks as the CI `checks` job from the repository root, in this
order. `pnpm typecheck` builds the workspace packages that later tests import:

```bash
pnpm audit --audit-level moderate
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm format:check
```

Install Chromium once, then run the browser journeys against a production
build:

```bash
pnpm --filter web exec playwright install chromium
pnpm test:e2e
```

The browser suite covers upload, correction, re-parsing after refresh, interim
ZIP export, competing-tab conflicts, reset, and phone-width layout. Completion
rules and completed-report output have package and web unit/integration tests;
the browser export journey currently verifies an interim ZIP. CI runs the
browser suite in a separate Chromium job and retains failure evidence.

To add a shadcn component, run its CLI on demand from the repository root:

```bash
pnpm dlx shadcn@latest add -c apps/web <component>
```

The current component state variants live in `apps/web/src/index.css`. Review
that file when adding components that need further variants or utilities.

## Repository guide

| Location                    | Responsibility                                                        |
| --------------------------- | --------------------------------------------------------------------- |
| `apps/web`                  | React UI, browser-only ingestion, review, draft storage, and download |
| `apps/api`                  | Cloudflare Worker scaffold with `GET /health`                         |
| `packages/contracts`        | Shared schemas, validation, and safe persistence contracts            |
| `packages/hl7-parser`       | HL7 message parsing and source locations                              |
| `packages/mapping-engine`   | Default profile, mapping execution, evidence, and corrections         |
| `packages/report-generator` | Report files and in-memory ZIP creation                               |
| `fixtures`                  | Synthetic HL7 messages and expected output                            |

Start with [project structure](docs/project-structure.md) for boundaries and
[product requirements](docs/product-requirements.md) for the intended scope.
Detailed references cover [ingestion](docs/hl7-ingestion.md),
[supported fields](docs/supported-hl7-fields.md),
[mapping execution](docs/mapping-execution.md),
[guided review](docs/guided-review.md),
[report generation](docs/report-generation.md), and
[profile persistence](docs/client-profile-persistence.md). The
[ingestion validation backlog](docs/ingestion-validation-todo.md) lists future
decisions and is not a list of current behavior.

This repository demonstrates privacy-aware boundaries; it does not claim that
the code or public demo is HIPAA compliant. Production use would require
appropriate infrastructure, agreements, controls, policies, and risk review.
