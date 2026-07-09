# Report generation

The report package is the final handoff from the HL7 Data Mapper workflow. It
turns the parsed, mapped, and reviewed message into a downloadable ZIP that a
human can inspect and another system could read.

For the public demo, the report should prove the workflow without storing or
exporting real PHI. The app uses synthetic data only, and raw HL7 source text is
excluded from the required report files by default.

## Required ZIP contents

The required report folder is:

```text
hl7-data-mapper-report/
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

### `REPORT.md`

Human-readable summary of the mapping run.

It should explain:

- client and profile used;
- profile version;
- HL7 version and message type;
- extraction status;
- guided-review status;
- warnings and missing fields; and
- where to find the machine-readable files.

### `manifest.json`

Machine-readable table of contents.

It includes:

- contract schema version;
- app name;
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

### `hl7-items.json`

The ordered mapping instructions used for the run.

This file shows how fields were collected. It stores mapping rules, such as
`PID-5.1`, not raw HL7 message text.

### `review-decisions.json`

The guided-review decisions for each reviewed field.

Each decision can include:

- field ID;
- normalized path;
- linked `hl7Item` ID;
- review status;
- source path; and
- whether a correction was applied.

The report-friendly decision shape is `ReportReviewDecisionSchema`.

### `validation-results.json`

Structured validation results.

This includes errors, warnings, and info messages from the parsing, mapping, and
review workflow.

### `mapping-summary.csv`

A spreadsheet-friendly summary for business users.

The required columns are:

```text
section,targetPath,valueStatus,sourcePath,hl7ItemId,reviewStatus,transformApplied
```

The columns are represented by `MAPPING_SUMMARY_CSV_COLUMNS`.

## Raw source policy

The required report does not include `source.hl7` by default.

If a later demo flow includes a source file, it must use the
`synthetic_source_included` policy and clearly mark the source as synthetic.
Real PHI must never be included in the public report package.

## Shared contracts

Report contracts live in `packages/contracts/src/report.ts`.

Report file generation lives in `packages/report-generator`.

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
