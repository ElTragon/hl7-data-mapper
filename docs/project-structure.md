# Project Structure

This project is organized as a small TypeScript monorepo. Each folder has one job, so the code stays easier to understand as the HL7 workflow grows.

## Workspace map

```text
apps/
  web/                         React app and user workflow

packages/
  contracts/                   Shared schemas and TypeScript types
  hl7-parser/                  Raw HL7 text parser
  mapping-engine/              Client-specific extraction and mapping logic

docs/                          Product, architecture, and security notes
fixtures/                      Synthetic HL7 examples and expected output
```

## Dependency direction

```text
contracts
  ↑
mapping-engine ← hl7-parser
  ↑
web
```

In plain English:

- `contracts` defines the shapes everyone agrees on.
- `hl7-parser` reads HL7 text and turns it into structured HL7 data.
- `mapping-engine` uses parsed HL7 data and `hl7Item` rules to produce normalized output.
- `web` is the user interface that guides upload, edit, review, and report export.

## Package rules

### `@hl7-data-mapper/contracts`

Allowed:

- normalized output schemas
- shared TypeScript types
- validation helpers

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
- client-specific `hl7Item` steps
- evidence showing how a normalized field was collected

Avoid:

- React UI
- direct DOM or browser APIs
- parsing raw HL7 text without going through `hl7-parser`

## Root commands

Run these from the project root:

```bash
pnpm typecheck
pnpm build
pnpm lint
pnpm test
pnpm format:check
```
