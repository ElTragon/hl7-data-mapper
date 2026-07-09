# API

Cloudflare Worker scaffold for the HL7 Data Mapper API.

The public demo is synthetic-data only. Do not send PHI, card data, or bank
information to this app.

## Commands

```bash
pnpm --filter api dev
pnpm --filter api typecheck
pnpm --filter api deploy
```

## Current endpoints

- `GET /health` returns service metadata and demo data policy.

Future phases will add ingestion, report generation, rate limiting, and D1
profile metadata endpoints.
