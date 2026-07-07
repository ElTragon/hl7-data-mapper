# Mapping Engine

Client-specific mapping package for the HL7 Data Mapper workspace.

This package will sit between the raw HL7 parser and the normalized contracts:

1. receive parsed HL7 data from `@hl7-data-mapper/hl7-parser`
2. apply default and client-specific `hl7Item` mapping steps
3. produce validated output shaped by `@hl7-data-mapper/contracts`
4. preserve evidence about how each field was collected for review and reporting

It should not parse raw HL7 text directly and should not render UI. Its main job is to make the extraction workflow explainable, repeatable, and client-aware.

## Current utilities

- `hl7-value-helpers.ts`: shared helpers for mapping common HL7 datatypes such
  as CX identifiers, XPN names, XAD addresses, XTN telecom values, CE/CWE coded
  values, EI identifiers, XCN providers, and TS dates/timestamps.
- `default-composers.ts`: default composers for normalized MSH message/sender
  metadata, PID patient data, IN1 coverage, GT1 guarantor data, ORC/OBR/TQ1
  lab orders, and SPM specimen data.

Use `composeDefaultNormalizedOutput(parsedMessage)` to produce the complete
default normalized JSON for the MVP OML^O21 workflow.

## Default composer coverage

The current default mapping path covers:

- `MSH` message metadata and sender/client routing;
- `PID` patient identifiers, demographics, address, and telecom values;
- `IN1` coverage and subscriber values;
- `GT1` guarantor values;
- `ORC` and `OBR` lab-order identifiers, status, provider, and service values;
- `TQ1` timing values; and
- `SPM` specimen identifiers, type, collection, receipt, and container values.

Tests compare the generated normalized output against the canonical expected
fixture in `fixtures/expected/oml-o21-basic.normalized.json`.

More detail: [../../docs/mapping-execution.md](../../docs/mapping-execution.md)
