# Default mapping composers

The mapping engine turns a parsed HL7 message into the normalized JSON shape
defined by `@hl7-data-mapper/contracts`.

For the current MVP scope, the default entry point is:

```ts
composeDefaultNormalizedOutput(parsedMessage)
```

It accepts a `ParsedHl7Message` from `@hl7-data-mapper/hl7-parser` and returns a
`NormalizedOutput` object for the supported synthetic `OML^O21` laboratory
order workflow.

## Current scope

The default composers support the standard places this project expects data to
appear in an HL7 v2.5.1 OML/O21 message:

| Normalized section    | Composer                 | Source segments            |
| --------------------- | ------------------------ | -------------------------- |
| Message metadata      | `composeMessageMetadata` | `MSH`                      |
| Sender/client routing | `composeSender`          | `MSH`                      |
| Patient               | `composePatient`         | `PID`                      |
| Coverage              | `composeCoverages`       | `IN1`                      |
| Guarantor             | `composeGuarantor`       | `GT1`                      |
| Lab orders            | `composeLabOrders`       | `ORC`, `OBR`, `TQ1`, `SPM` |
| Specimens             | `composeSpecimens`       | `SPM`                      |

These functions intentionally compose business objects, not UI state. They do
not parse raw HL7 text, render review screens, write files, or claim full HL7
conformance.

## Helper layer

`hl7-value-helpers.ts` holds reusable datatype helpers for common HL7 values:

- identifiers such as `CX` and `EI`;
- person names such as `XPN` and compact name values;
- addresses such as `XAD`;
- telecom values such as `XTN`;
- coded values such as `CE` and `CWE`;
- providers such as `XCN`;
- dates and timestamps such as `DT`, `TS`, and timestamp ranges.

This keeps the composer functions readable. The composer decides which HL7
field should populate a normalized property, while the helper decides how that
HL7 datatype is converted.

## Deterministic behavior

The default composer path is deterministic:

1. parse the source HL7 message once;
2. read known source segments and fields;
3. normalize values using shared helper functions;
4. group each `ORC` with its related `OBR`, `TQ1`, and `SPM` segments; and
5. return the same normalized JSON for the same parsed message.

That determinism matters because users will later review each section and
decide whether the default extraction is correct for a specific client.

## Fixture-backed acceptance

The mapping-engine tests compare the full generated normalized object against:

```text
fixtures/expected/oml-o21-basic.normalized.json
```

That gives the project a stable contract: when default mapping behavior changes,
the expected normalized fixture must change with it.

## Future work

The default composers are the foundation for client-specific mapping execution.
Future work should add:

- versioned client profiles;
- ordered `hl7Item` execution;
- field-level mapping evidence for review screens;
- user-confirmed mapping overrides; and
- downloadable report generation.
