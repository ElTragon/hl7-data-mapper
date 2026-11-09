# Report generation

The report package is the final handoff from the HL7 Data Mapper workflow. It
turns the parsed, mapped, and reviewed message into a downloadable ZIP that a
human can inspect and another system could read.

For the public demo, the report should prove the workflow without storing or
exporting real PHI. The app uses synthetic data only, and raw HL7 source text is
excluded from the required report files by default.

## Required ZIP contents

The web app names the report folder from the active profile's client ID. For
the bundled profile, it is:

```text
default-oml-o21/
  REPORT.md
  manifest.json
  normalized-data.json
  hl7-items.json
  review-decisions.json
  validation-results.json
  mapping-summary.csv
```

These files are represented by `REQUIRED_REPORT_FILE_NAMES` in
`packages/contracts/src/report.ts`.

`source.hl7` is optional. It is excluded by default and may only be generated
when the report uses the `synthetic_source_included` policy.

The report generator creates the ZIP archive in memory with
`buildReportZip(reportPackage, options)`. Without a folder option, the package
uses `hl7-data-mapper-report`; the web app passes its client ID explicitly. It
uses `fflate`, a browser-compatible ZIP library, and the web app passes the
returned `Uint8Array` to the browser download flow.

## Web download flow

After parsing, the React app labels the download as an **interim report** until
the current completion rules resolve mapped fields, record leaves, and issues
without validation errors. It then offers a **completed report**. Both require
valid normalized output; interim exports do not bypass
`NormalizedOutputSchema`. Parser errors prevent export.

Manifest version `1.3.0` includes a `review` summary with status, total, resolved,
unresolved, error, warning, and informational counts. `REPORT.md` shows the same
status and unresolved count. The generator derives completion from mapping items,
current normalized values, validation issues, and matching decisions. Decisions
must match the field ID, target path, and current source identity, including the
join separator where applicable. Warning acknowledgments must match the issue
path and source path. The generator rejects a requested completed export if those
inputs do not support completion.

Each export uses one cloned workspace snapshot. Input changes, review decisions,
source corrections, reset, and reload cancel pending downloads. An older export's
completion or failure cannot change the status of a newer attempt. Parser and
source-read warnings remain in the report even after acknowledgment. The
`correctionApplied` flag records applied correction history, including fields
confirmed after correction.

For the public demo, the button:

- uses the active profile and current mapping result from the review session;
- composes normalized output from the current parsed message and mapping draft;
- converts reviewable fields into report review decisions;
- hashes the source message and generated report files in the browser;
- creates the ZIP with `buildReportZip`; and
- triggers a browser download with an object URL.

The browser download is intentionally local. It does not upload the message,
store raw HL7 text, or write report data to a public database.

Playwright journeys verify interim and completed ZIP downloads after upload,
correction, reload, and re-parsing. The completed-export journey also checks
relocated repeated-record corrections and sibling values. Web and
report-generator tests cover report assembly and completion validation.

## Package stages and trust boundaries

[`buildReportPackage`](../packages/report-generator/src/build-report-package.ts)
first checks the input with Zod schemas for normalized data, each `hl7Item`,
each decision, and the validation summary. It rejects parser errors even for
interim export, duplicate decision IDs, and a requested completed status that
its own [completion check](../packages/report-generator/src/review-completion.ts)
cannot justify. That completion check visits mapping items, emitted array
record leaves, and validation issues; the `hl7Item.reviewRequired` flag does
not currently exempt an item.

The [payload builder](../packages/report-generator/src/payload-files.ts) makes
the human report, JSON, and CSV. The [manifest builder](../packages/report-generator/src/manifest.ts)
asks the caller's hash callback for each payload's SHA-256, records its UTF-8
byte length, then validates the manifest. The manifest is not among the files
it hashes. [`buildReportZip`](../packages/report-generator/src/build-report-zip.ts)
uses `fflate` to compress the ordered files synchronously in memory and returns
bytes; the web app owns the Blob URL and download.

The web app computes the source-message SHA-256 from the raw editor text and
supplies a hash callback using browser crypto. The report generator accepts
those supplied hashes; it does not independently rehash the original message
or verify that an input is synthetic. The normal ZIP omits the source message,
so rerunning the same mapping requires the original HL7 text, the exported
rules, and compatible mapping code. The hash can compare a candidate message
with the original; it cannot reconstruct the message. Keeping all files and ZIP
bytes in memory suits the bounded demo input but is a scaling consideration for
larger exports.

### `REPORT.md`

Human-readable summary of the mapping run.

It should explain:

- client and profile used;
- profile version;
- app version;
- HL7 version and message type;
- extraction summary counts;
- guided-review status counts;
- warnings and missing fields; and
- where to find the machine-readable files.

### `manifest.json`

Machine-readable table of contents.

It includes:

- contract schema version;
- app name;
- app version;
- generation timestamp;
- client ID;
- profile ID;
- profile version;
- HL7 version;
- message type and structure;
- message control ID when available;
- source-message SHA-256 hash;
- source policy; and
- SHA-256 hash, media type, and byte length for each payload file.

The manifest is validated by `ReportManifestSchema`.

The manifest does not hash itself. That avoids a circular problem where adding
the manifest hash would change the manifest content and therefore change the
hash again.

### `normalized-data.json`

The normalized extraction output.

This is the business-friendly JSON object produced by the mapping workflow. For
the public demo, it must be synthetic only.

Before writing this file, the report generator validates the payload with
`NormalizedOutputSchema`.

### `hl7-items.json`

The mapping instructions used for the run, with resolved paths and sources for
the current message. The executor sorts rules by sequence when it runs them;
this file follows the profile's item-set order.

This file shows how fields were collected. It stores mapping rules, such as
`PID-5.1`, not raw HL7 message text.

Before writing this file, the report generator validates each item with
`Hl7ItemSchema`.

### `review-decisions.json`

The guided-review decisions for each reviewed field.

Each decision can include:

- field ID;
- normalized path;
- linked `hl7Item` ID;
- review status;
- source path; and
- whether a correction was applied;
- a structured review reason; and
- an optional operational review note.

Review notes explain client mapping or source-data decisions. They must not be
used to store patient information. In the public demo, free-text review notes
remain in memory for the active review and generated report. They are not saved
to browser storage.

The report-friendly decision shape is `ReportReviewDecisionSchema`.

Before writing this file, the report generator validates each decision with
`ReportReviewDecisionSchema`.

### `validation-results.json`

Structured validation results.

This includes errors, warnings, and info messages from the parsing, mapping, and
review workflow.

Before writing this file, the report generator validates the payload with
`ValidationSummarySchema`.

### `mapping-summary.csv`

A spreadsheet-friendly summary for business users.

The required columns are:

```text
section,targetPath,valueStatus,sourcePath,hl7ItemId,reviewStatus,transformApplied,reviewReason,reviewNote,sourceDetails
```

The columns are represented by `MAPPING_SUMMARY_CSV_COLUMNS`.
`sourcePath` retains the current primary source for older consumers.
`sourceDetails` lists every current ordered source for a direct mapping, with its
message row, any literal split rule, and the join separator when sources are
combined. Record-specific leaves retain the sources recorded for that leaf;
issue-only rows use their review-decision sources.
`review-decisions.json` also records the ordered source references and join
separator, while `hl7-items.json` records the mapping action and join separator. These details
let a report show how a combined value reached its normalized target.
Completion requires full source identity for multi-source, row-pinned, and
literal-split rules, and checks the separator for join mappings.

CSV values are escaped when needed, so commas, quotes, and new lines do not break
spreadsheet imports.

## Raw source policy

The required report does not include `source.hl7` by default.

If a later demo flow includes a source file, it must use the
`synthetic_source_included` policy and clearly mark the source as synthetic.
Real PHI must never be included in the public report package.

The report generator enforces this boundary: `syntheticSourceText` is rejected
unless the policy is `synthetic_source_included`, and that policy requires a
non-empty synthetic source message.
This policy controls the optional source file. Callers must also keep real PHI
out of normalized data, source references, validation messages, and free-text
review notes; schema validation is not a general PHI detector.

## Shared contracts

Report contracts live in `packages/contracts/src/report.ts`.

Report file generation lives in `packages/report-generator`.

ZIP generation also lives in `packages/report-generator`.

Current contracts:

- `ReportFileNameSchema`
- `ReportFileManifestEntrySchema`
- `ReportManifestSchema`
- `ReportReviewDecisionSchema`
- `ReportPackagePlanSchema`
- `ReportSourcePolicySchema`
- `ReportGenerationStatusSchema`
- `MappingSummaryCsvColumnSchema`

In plain English: this file is the report checklist. If the report does not
match the checklist, it is not considered complete.

## Changing report output

Change the [report contracts](../packages/contracts/src/report.ts) when the
required file list or manifest shape changes, then update the
[payload builder](../packages/report-generator/src/payload-files.ts),
[human report](../packages/report-generator/src/markdown-report.ts), or
[CSV builder](../packages/report-generator/src/mapping-summary.ts) as needed.
For a completion-rule change, keep the [shared review helper](../packages/contracts/src/review-completion.ts)
and the report generator's [independent assessment](../packages/report-generator/src/review-completion.ts)
aligned. Update the browser handoff in
[`review-report.ts`](../apps/web/src/features/ingestion/review-report.ts)
if it needs a new field. Verify package
[integration tests](../packages/report-generator/src/report-package.integration.test.ts),
[ZIP tests](../packages/report-generator/src/build-report-zip.integration.test.ts),
and the [browser export journey](../apps/web/tests/e2e/review-workflow.spec.ts).

See the [documentation index](README.md) for the complete reading path.
