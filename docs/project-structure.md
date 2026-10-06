# Project structure

This TypeScript workspace separates the browser workflow, the Cloudflare Worker,
and reusable packages.

## Workspace map

```text
apps/
  web/                         React app: local ingestion, review, and ZIP download
  api/                         Cloudflare Worker: /health endpoint

packages/
  contracts/                   Shared schemas, types, and lifecycle helpers
  hl7-parser/                  HL7 v2 message parsing and structural validation
  mapping-engine/              Profile execution, default composers, and guided review
  report-generator/            Report files and ZIP creation in memory

docs/                          Product and architecture documentation
fixtures/                      Synthetic HL7 messages and expected output
```

## Package dependencies

An arrow means the package on the left declares a dependency on the package on
the right:

```text
web              → contracts, hl7-parser, mapping-engine, report-generator
mapping-engine   → contracts, hl7-parser
report-generator → contracts
api              → contracts
```

`contracts` and `hl7-parser` have no workspace package dependencies. The API
and report generator do not depend on the mapping engine.

In the current browser workflow, `web` parses a synthetic HL7 message with
`hl7-parser`, runs the selected profile with `mapping-engine`, and builds guided
review fields from the mapping result. For export, it combines the default
normalized composer output with the profile's mapped values, then calls
`report-generator` to validate and create report files and a ZIP. The browser
downloads those bytes locally. The Worker currently serves `/health`; profile
storage and server-side report processing are planned.

`contracts` defines the normalized data, profile, review, report, and safe
persistence shapes shared by these packages. Its D1 record schemas are
contracts for future storage work; they do not create a database or persist
messages. The browser demo uses the snapshot contract for temporary profile
edits and review decisions without storing raw HL7 text.

For details, see [normalized data](normalized-data-model.md),
[client profiles](client-profiles.md),
[profile persistence](client-profile-persistence.md),
[mapping execution](mapping-execution.md), and
[report generation](report-generation.md).

## Package boundaries

### `@hl7-data-mapper/contracts`

Owns schemas, shared types, validation helpers, profile lifecycle helpers,
review-completion helpers, and browser/D1 persistence record shapes. It does
not parse HL7, upload files, or render the UI.

### `@hl7-data-mapper/hl7-parser`

Parses raw HL7 text into ordered segments, fields, repetitions, components, and
subcomponents with source positions and structural issues. It does not decide
how those values map to a client profile or normalized output.

### `@hl7-data-mapper/mapping-engine`

Executes ordered `hl7Item` rules against parsed messages, applies the supported
named transforms, and returns a normalized draft, validation issues, and source
evidence. It also supplies default normalized composers and guided-review
helpers. It does not parse raw text or render React components.

### `@hl7-data-mapper/report-generator`

Validates report inputs, creates the report files and manifest, and compresses
them into a ZIP in memory with `buildReportZip`. The web app owns the browser
download; the package does not use DOM APIs or change mapping results.

### `api`

Handles Cloudflare Worker requests. Its implemented route is `/health`, with
security and no-store response headers. Profile metadata, D1 persistence,
rate limiting, and report processing remain planned.

See the [root README](../README.md) for setup and validation commands.
