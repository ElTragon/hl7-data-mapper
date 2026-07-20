# HL7 Data Mapper

HL7 Data Mapper is a guided onboarding workspace for reviewing HL7 v2
messages, validating extracted values, and documenting client-specific mapping
rules.

> The hosted portfolio demo is designed for synthetic data only. Do not upload
> protected health information (PHI).

## Planned workflow

1. Upload, paste, or generate a synthetic HL7 message.
2. Edit and validate the message.
3. Review patient, sender, coverage, guarantor, and lab-order data.
4. Correct client-specific mappings through traceable `hl7Item` steps.
5. Export the reviewed data and mapping documentation.

Corrections are rule-driven: changing a source during review updates the
client's `hl7Item` mapping and reruns extraction instead of only overwriting a
displayed value.

## Technology

- React, TypeScript, and Vite
- Tailwind CSS and shadcn/ui
- TanStack Router and TanStack Query
- Vitest and React Testing Library
- pnpm workspaces
- Cloudflare Pages and Workers for hosted features
- D1-compatible contracts for future profile metadata persistence

## Local development

Requirements:

- Node.js 22.13.1
- pnpm 11.10.0

```bash
nvm use
pnpm install
pnpm dev
```

Run the React web app locally:

```bash
pnpm dev
```

Vite will print the local URL, usually `http://localhost:5173`.

Run the Worker locally:

```bash
pnpm dev:api
```

Run the project checks:

```bash
pnpm typecheck
pnpm build
pnpm lint
pnpm test
pnpm format:check
```

## Workspace

```text
apps/
  web/                 React application
  api/                 Cloudflare Worker API
packages/
  contracts/           Shared schemas and TypeScript types
  hl7-parser/          Raw HL7 v2 parser
  mapping-engine/      Client-specific extraction and mapping logic
  report-generator/    Report file generation
docs/                  Product, architecture, and security documentation
fixtures/              Explicitly synthetic HL7 test fixtures
```

More detail: [docs/project-structure.md](docs/project-structure.md)

HL7 ingestion scope: [docs/hl7-ingestion.md](docs/hl7-ingestion.md)

Ingestion validation backlog:
[docs/ingestion-validation-todo.md](docs/ingestion-validation-todo.md)

Normalized contracts: [docs/normalized-data-model.md](docs/normalized-data-model.md)

Client profile versioning: [docs/client-profiles.md](docs/client-profiles.md)

Mapping execution: [docs/mapping-execution.md](docs/mapping-execution.md)

Guided review workflow: [docs/guided-review.md](docs/guided-review.md)

Client profile persistence: [docs/client-profile-persistence.md](docs/client-profile-persistence.md)

Persistence note: D1 is planned for profile metadata, mapping versions,
`hl7Item` rules, and safe audit events. The public demo must not write raw HL7
messages, extracted patient data, or real PHI to D1.

## Security position

This repository demonstrates a HIPAA-aware architecture; it does not claim
that a public demo or the source code alone is HIPAA compliant. Production use
would require appropriate infrastructure, agreements, policies, access
controls, audit controls, and an organizational risk assessment.
