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
The [web merge](../apps/web/src/features/ingestion/review-report.ts) merges
plain nested objects but replaces mapped scalar values and whole arrays,
including `null` or `[]`. The default composer fills paths without a profile
value. The two paths encode overlapping mapping policy, so a change to a
supported business field may require matching changes and tests in both.

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
An unqualified source selects the first segment with that name. An explicit
zero-based `segmentIndex` selects that exact parsed segment; field,
repetition, component, and subcomponent positions in the source path are
one-based. A read distinguishes an empty present field from a missing field
and retains raw segment and field evidence in memory. The source lookup
implementation is [here](../packages/mapping-engine/src/source-lookup.ts).

## Execution rules

- Validate the profile and reject archived profiles.
- Sort `hl7Item`s by ascending `sequence` and enforce dependency order through
  the profile contract.
- Read declared sources, or prior item outputs when an item has dependencies and
  no direct sources.
- Write each valid result to its normalized target path and record a trace
  entry. Invalid, missing, or unresolved saved record corrections produce trace
  errors without overwriting the parent output.
- Restrict target paths to lower-camel dot components under `message`, `sender`,
  `patient`, `coverages`, `guarantor`, or `labOrders`. Array indexes must be
  canonical nonnegative decimals no greater than `1023`; prototype-related
  JavaScript property names are rejected.
- Add an error when a required item produces no value. Report unknown named
  transforms with an informational `pending-transform` issue.

[`executeMapping`](../packages/mapping-engine/src/execution/execute-mapping.ts)
assembles `normalizedDraft`, per-item `NormalizedField`s, validation, and
`executionTrace`. [`executeItem`](../packages/mapping-engine/src/execution/execute-item.ts)
reads sources and applies the rule. Missing and empty reads become additional
source-read issues during [review validation collection](../packages/mapping-engine/src/guided-review/warning-review-fields.ts).
Each issue is assigned an identity based on origin, code, path, and source
coordinates, so review decisions do not depend on list order. The trace is
execution evidence and is not saved as a report file or browser snapshot.

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

The default composers enumerate repeating IN1 segments, PID address and
telecom repetitions, and ORC order groups with SPM specimens, including
structurally present empty records. The current profile's named address and
telecom transforms expand PID repetitions, the coverage transform expands IN1
segments, and the order transform expands ORC groups and their SPM specimens.
These profile transforms omit empty records, so output indexes can differ from
source coordinates. The browser export uses those mapped arrays in place of
the default composer arrays. Execution traces retain the source reads for each
emitted mapped record.
These expansions happen only for template sources without an explicit
repetition or segment occurrence. `getOrderGroups` treats each `ORC` and all
following segments up to the next `ORC` as one group. A saved correction to a
string leaf inside a repeated record becomes a dependent item after its parent
composer. Execution re-identifies the original record and source using
structural anchors; an ambiguous or changed segment-based replay yields
`unresolved-record-identity` and does not overwrite a sibling record. See
[repeat expansion](../packages/mapping-engine/src/execution/repeated-inputs.ts)
and [record identity](../packages/mapping-engine/src/execution/record-correction-identity.ts).

See [guided review](guided-review.md) for source corrections and
[normalized data](normalized-data-model.md) for the output schema.

## Execution validation

An explicit identifier repetition or component is authoritative. Preferred-type
selection searches repetitions only when the source is an unqualified field;
a missing explicit source never falls back to another identifier.

Required outputs must contain at least one meaningful value. Whitespace-only
strings, empty arrays, and recursively empty objects are missing; `false` and `0`
remain present. This presence check does not replace component-specific rules.
Unsupported actions produce an `unsupported-action` error with null output.
Implemented named transforms remain supported; unknown transforms retain their
existing pending-transform status.
The item's `required` flag controls this missing-output error.
`sourceExpectations.requiredness` provides reviewer guidance and can make an
optional empty component informational; it does not make an item required.
Temporal transforms reject impossible dates and unsupported precision with
`invalid-temporal-value`; a timestamp without an offset keeps its precision
and raises `missing-timezone`. See [temporal validation](../packages/mapping-engine/src/execution/temporal-validation.ts).

## Delimiter context

Mapping execution passes the message's detected MSH delimiters into datatype
transforms. Repetition, component, and subcomponent separators are never inferred
from literal `~`, `^`, or `&` characters in mapped values. Standalone helper calls
retain standard-delimiter defaults for compatibility. Escape tokens remain raw
source data; this change does not decode escapes or alter source evidence.

## Where to change mapping behavior

| Change                                          | Main code                                                                                                                                                                      | Check                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Field source, precedence, or review expectation | [Built-in profile](../packages/mapping-engine/src/profiles/default-oml-o21-profile.ts)                                                                                         | [Profile tests](../packages/mapping-engine/src/profiles/default-oml-o21-profile.test.ts), [field matrix](supported-hl7-fields.md)     |
| Source read or order grouping                   | [Source lookup](../packages/mapping-engine/src/source-lookup.ts)                                                                                                               | [Source lookup tests](../packages/mapping-engine/src/source-lookup.test.ts)                                                           |
| Action or named transform                       | [Action dispatcher](../packages/mapping-engine/src/execution/apply-supported-action.ts), [transform support](../packages/mapping-engine/src/execution/supported-transforms.ts) | Focused transform and [execution tests](../packages/mapping-engine/src/execution/execute-mapping.integration.test.ts)                 |
| Repeated records or correction identity         | [Repeat expansion](../packages/mapping-engine/src/execution/repeated-inputs.ts), [replay](../packages/mapping-engine/src/execution/execute-mapping.ts)                         | Repeated-record and [guided-review integration tests](../packages/mapping-engine/src/guided-review/guided-review.integration.test.ts) |
| Final exported business value                   | [Default composer](../packages/mapping-engine/src/default-composers.ts) and [web merge](../apps/web/src/features/ingestion/review-report.ts)                                   | [Composer tests](../packages/mapping-engine/src/default-composers.test.ts), normalized fixture, web report tests                      |

When adding a new target, update the [normalized schema](../packages/contracts/src/normalized-output.ts)
as well. A valid target-path string alone does not make a new output property
part of the business contract.

See the [documentation index](README.md) for the complete reading path.
