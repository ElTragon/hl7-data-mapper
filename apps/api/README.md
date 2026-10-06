# Worker API

This Cloudflare Worker is a separate scaffold for the HL7 Data Mapper. The
current browser ingestion, review, and report workflow runs locally in the web
app and does not call the Worker.

## Implemented endpoint

`GET /health` returns service metadata, the `synthetic-only` demo data policy,
and the configured report-size value. Other paths return JSON `not_found` with
HTTP 404. The Worker does not currently ingest messages, generate reports, or
read or write D1.

Run locally from the repository root after following the
[setup instructions](../../README.md#run-locally):

```bash
pnpm --filter api typecheck
pnpm dev:api
```

`wrangler.jsonc` includes a placeholder D1 database ID for future profile
metadata work. Configure a real binding before deployment; the current health
route does not use it. Planned API endpoints, rate limiting, and D1 persistence
must keep raw HL7 and extracted patient data out of server storage. The public
demo is synthetic-data only; do not send PHI, card data, or bank information.
