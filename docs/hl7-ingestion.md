# HL7 Ingestion

Phase 3 focuses on getting synthetic HL7 text into the application and turning
it into a structured, inspectable message. This phase proves we can read the
file correctly before we try to extract patient, coverage, guarantor, or lab
order business data.

## Goal

Build a safe ingestion path for the MVP-supported message profile:

- HL7 version: `2.5.1`
- Message type: `OML`
- Trigger event: `O21`
- Message structure: `OML_O21`
- Data policy: synthetic data only

In plain English, ingestion means:

1. receive HL7 text from upload, paste, or a built-in synthetic sample;
2. preserve the editable raw message text;
3. normalize segment line endings internally;
4. detect HL7 delimiters from `MSH`;
5. split the message into segments and fields;
6. run basic MVP profile checks; and
7. show parse results, warnings, and blocking errors to the user.

## In scope

Phase 3 includes:

- `.hl7` and `.txt` message input up to 1 MiB;
- pasted message text;
- loading a built-in synthetic OML/O21 sample;
- editable raw message text before parsing;
- parser support for segments, fields, repetitions, components, and
  subcomponents;
- source locations such as `PID-5.1` for later review screens;
- delimiter detection from `MSH`;
- basic profile validation for the MVP-supported OML/O21 workflow; and
- user-facing parse summaries in the web app.

## Out of scope

Phase 3 does not include:

- default patient, coverage, guarantor, or lab-order extraction;
- executing `hl7Item` mapping rules;
- client-specific mapping profiles;
- report ZIP generation;
- FHIR conversion;
- MLLP message receiving;
- HL7 acknowledgements;
- storing uploaded source messages;
- accepting real PHI; or
- claiming complete HL7 conformance validation.

Those belong to later phases.

## Basic validation rules

The ingestion layer should report errors for:

- missing `MSH`;
- `MSH` not being the first segment;
- unsupported `MSH-9`, meaning anything other than `OML^O21^OML_O21`;
- unsupported `MSH-12`, meaning anything other than `2.5.1`;
- missing `PID`, because this app profile requires one patient;
- missing order content, meaning no usable `ORC` or `OBR`; and
- malformed segment names.

The ingestion layer should report warnings for:

- order groups missing `SPM`;
- empty optional fields;
- repeated fields that will need mapping confirmation later; and
- fields that exist but cannot be cleanly addressed by a source path.

Errors block review. Warnings allow review but must be visible to the user.

## Expected parser output shape

The exact TypeScript types will live in `packages/hl7-parser`, but the parser
should return this kind of information:

```ts
{
  rawText: string
  normalizedText: string
  delimiters: {
    field: "|"
    component: "^"
    repetition: "~"
    escape: "\\"
    subcomponent: "&"
  }
  messageType: {
    code: "OML"
    triggerEvent: "O21"
    structure: "OML_O21"
  }
  version: "2.5.1"
  segments: []
  errors: []
  warnings: []
}
```

## Acceptance criteria

Phase 3 is complete when:

- a synthetic HL7 message can be pasted or loaded into the web app;
- the message can be edited before parsing;
- the parser detects delimiters from `MSH`;
- the parser returns ordered segment data;
- the parser can identify fields, repetitions, components, and subcomponents;
- the app shows message type, HL7 version, segment count, order count, errors,
  and warnings;
- invalid fixtures produce understandable validation errors;
- no uploaded message is stored outside local browser state; and
- root checks pass with `pnpm typecheck`, `pnpm build`, `pnpm lint`,
  `pnpm test`, and `pnpm format:check`.
