# Web app

This React, TypeScript, and Vite app runs the synthetic HL7 Data Mapper demo in
the browser. It accepts one OML^O21 message at a time, parses it locally, runs
the built-in mapping profile, guides field review and source corrections, and
downloads report ZIPs without sending the message to the Worker.

## Current browser workflow

1. Paste or upload synthetic `.hl7`/`.txt` text, or use the bundled sample. The
   editor and upload path enforce a 1 MiB UTF-8 byte limit.
2. Parse the message. Blocking profile errors stop review; warnings remain
   visible and are included in reports.
3. Review extracted fields, confirm or explain decisions, and choose alternate
   HL7 sources where needed. Corrections update a draft profile and rerun mapping.
4. Download an interim report while review remains open. The app offers a
   completed report when the completion rules pass. Both are ZIPs built locally.

Browser storage saves safe draft rules, decisions, correction history, and demo
events. It does not save the source message or extracted patient values. After
refresh, provide and parse the same message to resume its decisions. Reset
clears the saved demo draft. Use only synthetic data; do not upload PHI.

The UI currently uses one built-in client profile. Client creation, profile
publishing, D1 persistence, and server-side ingestion/export are planned.

## Work in this app

- `src/features/ingestion/hl7-ingestion-panel.tsx` owns input, parse results,
  review entry, and browser download.
- `src/features/ingestion/use-ingestion-workflow.ts` coordinates review state;
  `demo-storage.ts` handles its safe browser snapshot and write conflicts.
- `src/features/ingestion/guided-review/` renders the field and source-selection
  workflow. Parsing, mapping, contracts, and ZIP construction live in workspace
  packages rather than React components.
- `tests/e2e/review-workflow.spec.ts` exercises upload, correction, re-parsing
  after refresh, interim ZIP export, competing tabs, reset, and phone-width UI.

Start with the [repository README](../../README.md) for pinned Node/pnpm setup,
the required workspace build (`pnpm typecheck`), local commands, and the full CI
check list. After that setup, `pnpm dev` starts this app from the repository
root. Install Chromium with
`pnpm --filter web exec playwright install chromium`, then run `pnpm test:e2e`
to build and check the browser journeys.
