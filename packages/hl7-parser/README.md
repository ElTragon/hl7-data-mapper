# HL7 Parser

`@hl7-data-mapper/hl7-parser` turns raw HL7 v2 text into an ordered message
structure. The exported `parseHl7Message(rawText)` returns detected delimiters,
message type and version, segments, fields, repetitions, components,
subcomponents, and structural errors and warnings. Each field has an HL7 path;
segments also retain their index and raw text for source evidence during the
current in-memory workflow.

The parser validates the MVP message shape: HL7 2.5.1
`OML^O21^OML_O21`, a `PID` segment, and `ORC`/`OBR` order content. It reports
missing or misplaced order segments and warns when an order group has no `SPM`.
Callers decide whether an error should block the next workflow step.

The parser does not apply client mapping rules, build normalized patient data,
or create reports. See [mapping execution](../../docs/mapping-execution.md) for
the next step after parsing.
