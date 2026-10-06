# Report Generator

`@hl7-data-mapper/report-generator` builds a report package and its ZIP archive
in memory. The caller supplies normalized output, `hl7Item` rules, review
decisions, validation results, profile metadata, a message hash, and a content
hasher. `buildReportPackage()` validates the structured inputs and returns the
report files and manifest. `buildReportZip()` compresses those files with
`fflate` and returns ZIP bytes; the web app handles the browser download.

The standard report contains:

```text
REPORT.md
manifest.json
normalized-data.json
hl7-items.json
review-decisions.json
validation-results.json
mapping-summary.csv
```

`REPORT.md` summarizes the extraction and review state. `manifest.json` records
the profile and app versions, source-message hash, source policy, and hashes of
the payload files. The CSV uses the shared mapping-summary column order and
escapes spreadsheet-sensitive values.

The generated review status is `interim` until all required decisions are
resolved and blocking validation errors are cleared. The generator rejects a
requested `completed` report when those conditions are unmet. Raw `source.hl7`
is excluded by default; including it requires the explicit
`synthetic_source_included` policy and nonempty source text. The caller is
responsible for supplying synthetic text under that policy.

This package does not parse HL7, change mapping results, or use browser DOM
APIs. See [report generation](../../docs/report-generation.md) for file and
export details.
