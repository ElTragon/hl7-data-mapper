# HL7 Ingestion

HL7 ingestion gets synthetic HL7 text into the application and turns it into a
structured, inspectable message. The browser runs this layer before extracting
patient, coverage, guarantor, or lab-order business data.

## Current behavior

The implemented ingestion path supports this MVP message profile:

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

## Parser mechanics

[`parseHl7Message(rawText)`](../packages/hl7-parser/src/parse-hl7-message.ts)
is a pure function. It first changes CRLF and LF segment endings to carriage
returns, trims the message and individual nonempty segment lines, and preserves
both the original `rawText` and the resulting `normalizedText`. The first
segment supplies the field separator and four encoding characters only when it
starts with `MSH`; otherwise the parser uses the standard `|^~\&` separators
and reports the header problem. It then splits every segment into fields,
repetitions, components, and subcomponents.

`MSH` needs special treatment: its field separator is `MSH-1`, while its
encoding characters are `MSH-2`. The parser inserts the separator into its
field list so `MSH-9` and `MSH-12` retain their HL7 field numbers. An HL7
source path such as `PID-5.1` uses one-based field and component positions;
the parsed segment's `index` is zero-based. The parser keeps unknown segment
names and raw segment/field text for later evidence. It does not decode HL7
escape tokens or interpret patient and order values.

The parser returns `errors` and `warnings` with the parsed structure even for
invalid input. The [web parse handler](../apps/web/src/features/ingestion/hl7-ingestion-panel.tsx)
blocks review when `errors` is nonempty; warnings remain visible and flow into
mapping review. The parser validates the presence and order of `ORC`/`OBR`
groups but returns a flat ordered segment array. The mapping engine creates
the order-group objects later.

## In scope

The ingestion layer includes:

- message upload up to 1 MiB, with `.hl7` and `.txt` suggested by the file
  picker rather than enforced as extensions;
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

The current web app runs mapping, guided review, and report generation after a
valid parse; those capabilities sit outside the ingestion layer. Browser flows
for client creation and profile publishing, and server-side processing, remain
planned.

## Basic validation rules

The parser reports errors for:

- missing `MSH`;
- `MSH` not being the first segment;
- unsupported `MSH-9`, meaning anything other than `OML^O21^OML_O21`;
- unsupported `MSH-12`, meaning anything other than `2.5.1`;
- missing `PID`, because this app profile requires a patient segment (the
  current parser does not reject multiple `PID` segments);
- multiple `MSH` headers, including messages using different delimiters;
- missing order content, an `OBR` before any `ORC`, or an `ORC` group without
  an associated `OBR`; and
- malformed segment names.

The parser currently reports a warning for:

- each order group missing `SPM`.

Missing or empty source values encountered during mapping appear in guided
review as source-read issues. The parser does not currently warn just because
an optional field is empty or a field repeats.

Errors block review. Warnings allow review but must be visible to the user.

## Expected parser output shape

The exact TypeScript types live in `packages/hl7-parser/src/types.ts`. The
parser returns this information:

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

The current ingestion path provides:

- a synthetic HL7 message can be pasted or loaded into the web app;
- the message can be edited before parsing;
- the parser detects delimiters from `MSH`;
- the parser returns ordered segment data;
- the parser can identify fields, repetitions, components, and subcomponents;
- the app shows message type, HL7 version, segment count, order count, errors,
  and warnings;
- invalid fixtures produce understandable validation errors; and
- uploaded source text remains in browser memory rather than browser storage.

Repository checks for this path are `pnpm typecheck`, `pnpm build`, `pnpm lint`,
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

## Where to change ingestion

| Change                                                    | Code and focused check                                                                                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Segment splitting, delimiter detection, or profile errors | [Parser](../packages/hl7-parser/src/parse-hl7-message.ts) and [parser tests](../packages/hl7-parser/src/parse-hl7-message.test.ts)                                                                                      |
| Upload, paste, sample, size limit, or stale file reads    | [Input panel](../apps/web/src/features/ingestion/hl7-ingestion-panel.tsx), [limits](../apps/web/src/features/ingestion/input-limits.ts), and [input tests](../apps/web/src/features/ingestion/ingestion-input.test.tsx) |
| Meaning of a parsed source field                          | [Mapping execution](mapping-execution.md) and the [supported field matrix](supported-hl7-fields.md)                                                                                                                     |

Add a synthetic fixture for a new structural case. If a new field fits the
existing segment/field grammar, change its mapping rule rather than the parser.

See the [documentation index](README.md) for the complete reading path.
