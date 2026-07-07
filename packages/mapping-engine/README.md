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

The default profile is declarative. It lists ordered `hl7Item`s and their HL7
source references, but it does not execute them yet. Execution is added in the
next step of Phase 5.
