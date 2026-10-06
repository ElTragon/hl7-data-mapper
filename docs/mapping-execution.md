# Mapping execution

`executeMapping()` applies a client profile's ordered `hl7Item` rules to a
parsed HL7 message. For the same parsed message and profile contents, it returns
the same draft values, field evidence, validation results, and execution trace.

## Inputs and outputs

The function accepts a `parsedMessage` from `@hl7-data-mapper/hl7-parser` and a
`ClientProfile`, which it validates. Draft and published profiles can run; archived
profiles are rejected. The browser creates an editable draft from the built-in
published profile when a reviewer starts a session.

The result contains:

| Property           | Meaning                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `profile`          | Client, profile, version, and status used for the run                  |
| `normalizedDraft`  | Values written by the profile's rules at normalized target paths       |
| `normalizedFields` | Review wrappers with values, source references, transforms, and issues |
| `validation`       | Grouped errors, warnings, and informational issues                     |
| `executionTrace`   | In-memory evidence for each executed `hl7Item`                         |

`normalizedDraft` is a partial object. The web report flow combines it with
`composeDefaultNormalizedOutput(parsedMessage)` and validates the merged object
against `NormalizedOutputSchema` before generating a report. The default
composer maps the supported MSH, PID, IN1, GT1, ORC, TQ1, OBR, and SPM data
into the normalized model; the profile's current mapped values take precedence
in the web export.

Each normalized field includes its target key, label, value, source references,
primary source, transform history, validation issues, review status, and
warnings. The mapping result also includes review validation issues built from
the parsed message and mapping evidence. In the browser, parser errors prevent
entry to guided review; unresolved blocking validation errors prevent a
completed report.

## Source evidence

Each execution trace entry records the item ID and sequence, target path,
status, source reads, input and output values, and validation issues. A source
read includes the HL7 path (for example, `PID-5.1`), resolved value, lookup
status, segment index, raw segment, and raw field. This trace is held in memory
for review; it is not a persistence record.

The mapping engine exports `readSource()`, `readSourceValue()`,
`getSegmentsByName()`, and `getOrderGroups()`. Source lookup supports field,
repetition, component, and subcomponent positions. It returns statuses such as
`missing_segment`, `missing_field`, `missing_repetition`, and
`missing_component` instead of throwing for an absent value.

## Execution rules

- Validate the profile and reject archived profiles.
- Sort `hl7Item`s by ascending `sequence` and enforce dependency order through
  the profile contract.
- Read declared sources, or prior item outputs when an item has dependencies and
  no direct sources.
- Write each result to its normalized target path and record a trace entry.
- Restrict target paths to lower-camel dot components under `message`, `sender`,
  `patient`, `coverages`, `guarantor`, or `labOrders`. Array indexes must be
  canonical nonnegative decimals no greater than `1023`; prototype-related
  JavaScript property names are rejected.
- Add an error when a required item produces no value. Report unknown named
  transforms with an informational `pending-transform` issue.

## Implemented actions and transforms

The executor handles `extract`, `validate`, `default_value`, `normalize_date`,
`normalize_timestamp`, and `join`. `validate` can apply the named `mustEqual`
check. The built-in profile also uses these implemented named transforms:

| Transform                  | Result                                        |
| -------------------------- | --------------------------------------------- |
| `preferIdentifierType`     | Preferred patient identifier                  |
| `mapXpnName`               | Patient name from configured source roles     |
| `mapRepeatingXadAddresses` | Address array from configured source values   |
| `mapRepeatingXtnTelecom`   | Telecom array from configured source values   |
| `mapRepeatingIn1Coverage`  | Coverage array from configured source values  |
| `mapOptionalGt1Guarantor`  | Optional guarantor object                     |
| `mapOrcOrderGroups`        | Lab-order array from configured source values |

The `compose` action works for those named object transforms. `split` and
`map_code` exist in the `hl7Item` contract but have no dedicated general
execution behavior yet. A custom named transform outside the supported set is
marked pending. Do not rely on a contract action name alone as proof that its
generic behavior has been implemented.

The default composers can enumerate repeating IN1 segments, PID address and
telecom repetitions, and ORC order groups with SPM specimens. The current
profile's named address, telecom, coverage, and order transforms each produce
at most one entry from their configured source reads. Because the web export overlays
those mapped arrays onto the default composer output, support for multiple
entries in those sections still needs end-to-end validation and expansion.

See [guided review](guided-review.md) for source corrections and
[normalized data](normalized-data-model.md) for the output schema.
