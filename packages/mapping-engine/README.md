# Mapping Engine

Client-specific mapping package for the HL7 Data Mapper workspace.

This package will sit between the raw HL7 parser and the normalized contracts:

1. receive parsed HL7 data from `@hl7-data-mapper/hl7-parser`
2. apply default and client-specific `hl7Item` mapping steps
3. produce validated output shaped by `@hl7-data-mapper/contracts`
4. preserve evidence about how each field was collected for review and reporting

It should not parse raw HL7 text directly and should not render UI. Its main job is to make the extraction workflow explainable, repeatable, and client-aware.

## Current contents

- `profiles/default-oml-o21-profile.ts`: built-in published profile for the
  MVP HL7 v2.5.1 `OML^O21` laboratory-order workflow.
- `execute-mapping.ts`: deterministic executor that runs profile `hl7Item`s in
  sequence and returns a normalized draft, field-level evidence, validation,
  and execution trace.
- `source-lookup.ts`: source lookup helpers for reading HL7 fields,
  components, subcomponents, segments, and ORC order groups.

The current executor supports source reads, simple extraction, validation,
date/timestamp normalization, and execution tracing. Complex object composers
such as order-group assembly are declared by the default profile and reported
as pending transforms until the specialized mapping helpers are implemented.

The execution trace records source-read evidence, including source path,
resolved value, lookup status, segment index, raw segment, and raw field. This
is the data the guided review UI and report export can use to explain how each
field was collected.

More detail: [../../docs/mapping-execution.md](../../docs/mapping-execution.md)
