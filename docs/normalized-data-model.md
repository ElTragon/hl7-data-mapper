# Normalized data model

The normalized data model separates business data from mapping evidence.

This keeps exported JSON easy to read while still making every collected value
traceable back to the source HL7 message.

## Supported MVP profile

The contracts currently target one profile:

- HL7 version: `2.5.1`
- Message type: `OML`
- Trigger event: `O21`
- Message structure: `OML_O21`
- Schema version: `1.0.0`
- Data policy: synthetic data only

## Normalized output

`NormalizedOutputSchema` validates the clean business object used for export.
The browser merges the default composer's output with the profile's mapping
draft before validating it against this schema.

It contains:

```text
schemaVersion
clientId?
generatedAt?
message
sender
patient
coverages[]
guarantor
labOrders[]
validation?
```

Important rules:

- JSON keys use camelCase.
- Optional properties may be omitted; present nullable scalar values use `null`
  when absent from the source.
- Repeating concepts use arrays, even when only one value is present.
- Dates use `YYYY-MM-DD`.
- Timestamps use ISO 8601 and preserve the source UTC offset when supplied.
- Codes keep `code`, `display`, and `system` separate.
- The normalized object contains business values, not every mapping decision.

The canonical fixture is:

```text
fixtures/expected/oml-o21-basic.normalized.json
```

## Source references

`SourceReferenceSchema` describes where a value came from in the source HL7
message.

Examples:

```text
PID-5
PID-5.1
SPM-2[1].1.2
```

The model stores one-based HL7 positions because those are the positions users
expect to see in implementation notes and client review sessions.

## Normalized fields

`NormalizedFieldSchema` wraps one collected value with the metadata needed for
guided review.

It stores:

- `key`: machine-readable field key, such as `patient.name.family`;
- `label`: user-facing label;
- `value`: normalized value;
- `sources`: all HL7 locations used;
- `primarySource`: the main source location, when one exists;
- `transformHistory`: steps used to clean or reshape the value;
- `validation`: field-level validation issues;
- `reviewStatus`: current user review state; and
- `warnings`: simple warning messages.

The normalized output remains a clean business object. `NormalizedField` is
used for review screens, mapping evidence, and report files.

## Guided review fields

`ReviewableFieldSchema` turns normalized values into UI-ready review items.

Each reviewable field includes:

- the guided review step, such as patient or lab orders;
- the normalized path, such as `patient.name.family`;
- the extracted value;
- the related `hl7Item` ID;
- source evidence, including HL7 path and raw segment;
- transform history;
- validation issues and warnings;
- review status; and
- possible alternate HL7 sources.

This keeps the review UI focused on evidence while preserving the rule-driven
mapping model.

## Review statuses

Review statuses are:

```text
unreviewed
confirmed
incorrect
mapping_changed
unavailable
```

These represent the user's decision about a collected field during guided
review. `incorrect` means the user found a problem before the mapping rule is
changed. `mapping_changed` means the linked `hl7Item` has been updated.

## hl7Item mapping rules

An `hl7Item` is one atomic mapping instruction for a client.

It defines:

- the client ID;
- execution sequence;
- review section;
- normalized target path;
- one or more HL7 sources;
- mapping action;
- value type;
- dependencies on earlier `hl7Item`s;
- optional transform details; and
- whether the field is required or reviewable.

Multiple `hl7Item`s may contribute to one final field. The current profile
uses named patient-name transforms to read XPN components from `PID-5`; a
general-purpose `split` action is defined by the contract but is not yet
implemented by the executor.

## Validation

Validation issues can be:

```text
error
warning
info
```

Parser errors block review. Mapping validation errors prevent a completed
export, but the user can continue reviewing and download an interim report.
Warnings and info messages can be shown while the review workflow continues.

Validation issues may point to:

- normalized field key;
- review section;
- normalized path;
- HL7 segment; and
- source reference.

## Tests

Contract tests verify:

- source-reference path generation;
- `hl7Item` validation;
- duplicate `hl7Item` detection;
- normalized field defaults;
- validation summary grouping; and
- the canonical normalized fixture.

Mapping-engine tests also verify that the default composers can generate the
canonical normalized fixture from the supported synthetic OML/O21 message.

## Temporal values and precision

Normalized temporal values remain nullable strings. Their representation preserves
source precision: `2026`, `2026-07`, `2026-07-06`, `2026-07-06T10`, and
`2026-07-06T10:15` are distinct. Missing components are not filled with zeros.
Seconds may carry one through four fractional digits. Explicit offsets are
preserved as `±HH:MM`; an absent offset remains absent, never `Z` or the machine's
local timezone. A time without an offset creates a `missing-timezone` review
warning. Date-only values do not invent a time or need a timezone.

The supported calendar uses years 0001–9999, Gregorian leap-year rules, hours
00–23, and minutes/seconds 00–59. Leap seconds are not supported. The demo accepts
offsets from -14:00 through +14:00, with valid minutes and no minutes beyond the
14-hour boundary. Offsets require a time component. Impossible dates, unsupported
precision, and trailing content produce null output and an
`invalid-temporal-value` error, including optional and nested mapped fields.
Date extraction validates the full source timestamp before retaining its date.

Both the generic mapping executor and default report composers use the same
normalizer. The report preserves these strings and their validation issues.
Existing draft profile shapes remain compatible. The review engine revision
changes so decisions made under earlier normalization rules require review again.
