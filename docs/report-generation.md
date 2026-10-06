# Report generation

The report package is the final handoff from the HL7 Data Mapper workflow. It
turns the parsed, mapped, and reviewed message into a downloadable ZIP that a
human can inspect and another system could read.

For the public demo, the report should prove the workflow without storing or
exporting real PHI. The app uses synthetic data only, and raw HL7 source text is
excluded from the required report files by default.

## Required ZIP contents

The default report folder is named from the client ID, such as:

```text
northstar-lab/
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
`buildReportZip(reportPackage)`. It uses `fflate`, a small browser-friendly ZIP
library. The web app passes the returned `Uint8Array` to the browser download
flow.

## Web download flow

After parsing, the React app labels the download as an **interim report** until
all required review decisions are resolved and no validation errors remain. It
then offers a **completed report**. Both require valid normalized output; interim
exports do not bypass `NormalizedOutputSchema`. Parser errors prevent export.

Manifest version `1.2.0` includes a `review` summary with status, total, resolved,
unresolved, error, warning, and informational counts. `REPORT.md` shows the same
status and unresolved count. The generator derives completion from mapping items,
current normalized values, validation issues, and matching decisions. Decisions
must match the field ID, target path, and current primary source path; warning
acknowledgments must match the issue path and source path. The generator rejects a
requested completed export if those inputs do not support completion.

Each export uses one cloned workspace snapshot. Input changes, review decisions,
source corrections, reset, and reload cancel pending downloads. An older export's
completion or failure cannot change the status of a newer attempt. Parser and
source-read warnings remain in the report even after acknowledgment. The
`correctionApplied` flag records applied correction history, including fields
confirmed after correction.

For the public demo, the button:

- runs the default OML/O21 client profile locally;
- composes normalized output from the current parsed message;
- converts reviewable fields into report review decisions;
- hashes the source message and generated report files in the browser;
- creates the ZIP with `buildReportZip`; and
- triggers a browser download with an object URL.

The browser download is intentionally local. It does not upload the message,
store raw HL7 text, or write report data to a public database.

The current Playwright journey verifies an interim ZIP after upload, correction,
reload, and re-parsing the same message. Completed-report assembly is covered by
web and report-generator tests; the completed download journey has not yet been
verified in a browser test.

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

The ordered mapping instructions used for the run.

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
section,targetPath,valueStatus,sourcePath,hl7ItemId,reviewStatus,transformApplied,reviewReason,reviewNote
```

The columns are represented by `MAPPING_SUMMARY_CSV_COLUMNS`.

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
