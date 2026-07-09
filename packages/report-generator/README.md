# Report Generator

Builds the downloadable report package files for the HL7 Data Mapper workflow.

This package creates report files in memory. It does not know about React,
browser buttons, or ZIP compression.

Inputs:

- normalized output
- `hl7Item` rules
- guided-review decisions
- validation results
- client/profile metadata
- message hash

Outputs:

- `REPORT.md`
- `manifest.json`
- `normalized-data.json`
- `hl7-items.json`
- `review-decisions.json`
- `validation-results.json`
- `mapping-summary.csv`

The JSON outputs are validated against the shared contracts before they are
serialized. The CSV output uses the shared mapping-summary column order and
escapes spreadsheet-sensitive values.

`REPORT.md` is the human-readable cover sheet. It summarizes the client/profile
version, app version, extraction counts, review counts, validation results, and
privacy note.

`manifest.json` is the machine-readable table of contents. It records the app
version, profile version, message hash, source policy, and SHA-256 hashes for
each payload file.

`buildReportZip(reportPackage)` uses `fflate` to package the generated files
into a browser-safe ZIP archive in memory. The web app download button hands
those bytes to the browser.
