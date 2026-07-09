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

The ZIP step happens later in the web app.
