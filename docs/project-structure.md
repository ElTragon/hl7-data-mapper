# Project Structure

This project is organized as a small TypeScript monorepo. Each folder has one job, so the code stays easier to understand as the HL7 workflow grows.

## Workspace map

```text
apps/
  web/                         React app and user workflow
  api/                         Cloudflare Worker API

packages/
  contracts/                   Shared schemas and TypeScript types
  hl7-parser/                  Raw HL7 text parser
  mapping-engine/              Client-specific extraction and mapping logic
  report-generator/            Report file generation

docs/                          Product, architecture, and security notes
fixtures/                      Synthetic HL7 examples and expected output
```

## Dependency direction

```text
contracts
  ↑
mapping-engine ← hl7-parser
  ↑
web → report-generator
  ↑
api
```

In plain English:

- `contracts` defines the shapes everyone agrees on.
- `hl7-parser` reads HL7 text and turns it into structured HL7 data.
- `mapping-engine` uses parsed HL7 data, default composers, and later
  `hl7Item` rules to produce normalized output.
- `mapping-engine` also creates guided-review fields, progress summaries, and
  rule-driven correction updates for draft client profiles.
- `report-generator` turns normalized data, `hl7Item`s, review decisions, and
  validation results into report files in memory.
- `api` hosts Cloudflare Worker endpoints for health checks and later report
  generation, profile metadata, rate limiting, and planned D1-backed audit
  metadata.
- `contracts` defines safe persistence records for mapping-run metadata and
  audit events so storage code does not accept raw HL7 or patient payloads.
- `contracts` also defines the public-demo persistence policy so demo storage
  stays local, temporary, and resettable.
- `contracts` defines the browser demo snapshot shape so temporary profile
  edits, review decisions, and correction intents stay separated from raw HL7
  and patient data.
- `contracts` defines report package contracts so the manifest, file list,
  review decisions, and mapping summary stay predictable.
- `web` is the user interface that guides upload, edit, review, and report export.

Data-model details: [normalized-data-model.md](normalized-data-model.md)

Client profile persistence requirements:
[client-profile-persistence.md](client-profile-persistence.md)

Client profile rules: [client-profiles.md](client-profiles.md)

Mapping execution rules: [mapping-execution.md](mapping-execution.md)

Report generation rules: [report-generation.md](report-generation.md)

## Package rules

### `@hl7-data-mapper/contracts`

Allowed:

- normalized output schemas
- `hl7Item` mapping schemas
- guided review field schemas
- source-reference schemas
- review-status schemas
- shared TypeScript types
- validation helpers
- report package schemas

Avoid:

- React components
- raw file upload logic
- HL7 parsing logic

### `@hl7-data-mapper/hl7-parser`

Allowed:

- HL7 segment parsing
- field, repetition, component, and subcomponent parsing
- source-location tracking

Avoid:

- patient-specific output decisions
- client-specific mappings
- report ZIP generation

### `@hl7-data-mapper/mapping-engine`

Allowed:

- default mapping rules
- normalized output composers
- HL7 datatype value helpers
- client-specific `hl7Item` steps
- evidence showing how a normalized field was collected

Avoid:

- React UI
- direct DOM or browser APIs
- parsing raw HL7 text without going through `hl7-parser`

### `@hl7-data-mapper/report-generator`

Allowed:

- building report files in memory
- creating `REPORT.md`
- creating report JSON files
- creating mapping-summary CSV content
- validating report manifests through `contracts`

Avoid:

- ZIP compression
- browser download APIs
- parsing raw HL7 text
- changing mapping results

### `api`

Allowed:

- Cloudflare Worker request handling
- health and metadata endpoints
- report generation endpoints in later phases
- planned D1-backed profile metadata in later phases
- security headers, request IDs, rate limiting, and logging controls

Avoid:

- storing raw HL7 messages
- storing extracted patient data
- browser-only APIs
- claiming HIPAA compliance

## Root commands

Run these from the project root:

```bash
pnpm typecheck
pnpm build
pnpm lint
pnpm test
pnpm format:check
```
