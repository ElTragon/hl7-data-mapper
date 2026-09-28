# HL7 Ingestion

HL7 ingestion gets synthetic HL7 text into the application and turns it into a
structured, inspectable message. This layer proves we can read the file
correctly before we try to extract patient, coverage, guarantor, or lab-order
business data.

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

The ingestion layer includes:

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

The ingestion layer does not include:

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

Those belong to later application capabilities.

## Basic validation rules

The ingestion layer should report errors for:

- missing `MSH`;
- `MSH` not being the first segment;
- unsupported `MSH-9`, meaning anything other than `OML^O21^OML_O21`;
- unsupported `MSH-12`, meaning anything other than `2.5.1`;
- missing `PID`, because this app profile requires one patient;
- multiple `MSH` headers, including messages using different delimiters;
- missing order content, an `OBR` before any `ORC`, or an `ORC` group without
  an associated `OBR`; and
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

The ingestion layer is complete when:

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

## Input limits and upload lifecycle

The web app accepts one message at a time. Multiple segment-start `MSH`
headers produce a blocking `multiple_messages` error before field parsing.
Order groups run from each `ORC` to the next `ORC` or message end, matching
mapping execution. Each group requires at least one `OBR`; missing `SPM`
remains a warning. Repeated OBR and SPM segments remain preserved. Issues
identify their segment position in the UI (one-based; parser indexes are zero-based).

The input limit is 1,048,576 bytes (1 MiB). Files are checked before reading;
decoded upload text and editor text are measured as UTF-8 before parsing,
trimming, or normalization. Oversized edits stay visible for correction and
cannot be parsed. This byte policy does not define additional encoding support.

Selecting a replacement file clears the previous parse and review immediately,
while preserving editor text until a successful read. Parsing is disabled while
reading. Failed or oversized uploads preserve the previous text, which can be
parsed again. Selecting another file (even an oversized one), editing text,
loading the sample, or unmounting invalidates pending reads. Older results and
failures cannot replace newer input or change its loading/error state. A failed
file can be selected again. An export already being generated is discarded if
its input is replaced before the download begins.
