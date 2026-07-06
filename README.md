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

## Technology

- React, TypeScript, and Vite
- Tailwind CSS and shadcn/ui
- TanStack Router and TanStack Query
- Vitest and React Testing Library
- pnpm workspaces
- Cloudflare Pages, Workers, and D1 in later phases

## Local development

Requirements:

- Node.js 22.13.1
- pnpm 11.10.0

```bash
nvm use
pnpm install
pnpm dev
```

Run the project checks:

```bash
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

## Workspace

```text
apps/
  web/                 React application
packages/              Shared domain packages added in later phases
docs/                  Product, architecture, and security documentation
fixtures/              Explicitly synthetic HL7 test fixtures
```

## Security position

This repository demonstrates a HIPAA-aware architecture; it does not claim
that a public demo or the source code alone is HIPAA compliant. Production use
would require appropriate infrastructure, agreements, policies, access
controls, audit controls, and an organizational risk assessment.
