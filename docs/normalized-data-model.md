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

`NormalizedOutputSchema` is the clean business object produced by a successful
mapping run.

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
- Missing optional scalar values use `null`.
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
review.

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

Multiple `hl7Item`s may contribute to one final field. For example, a mapping
can first extract `PID-5`, then split it into family and given names.

## Validation

Validation issues can be:

```text
error
warning
info
```

Errors block review. Warnings and info messages can be shown to the user while
still allowing the review workflow to continue.

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
