# Mapping execution

Mapping execution turns the normalized contracts into repeatable behavior.

The goal is deterministic execution: the same parsed HL7 message plus the same
client profile version should produce the same draft output, review evidence,
validation summary, and execution trace.

## Inputs

`executeMapping()` accepts:

```text
parsedMessage
profile
```

- `parsedMessage` comes from `@hl7-data-mapper/hl7-parser`.
- `profile` is a validated `ClientProfile`.

Archived profiles cannot be executed. Draft and published profiles can be
executed, but published profiles are treated as immutable by the workflow.

## Outputs

`executeMapping()` returns:

```text
profile
normalizedDraft
normalizedFields
validation
executionTrace
```

### `normalizedDraft`

A partial normalized object created by generic `hl7Item` execution.

It is called a draft because complex object composers are not complete yet.
For example, lab-order grouping requires ORC, TQ1, OBR, and SPM-specific logic.

### `normalizedFields`

Review-ready field wrappers. Each field includes:

- normalized key;
- label;
- value;
- source references;
- primary source;
- transform history;
- validation issues;
- review status; and
- warnings.

### `validation`

Grouped validation issues:

```text
errors
warnings
info
```

Errors block review. Warnings and info messages can be shown while allowing
the user to continue.

### `executionTrace`

The audit trail for every executed `hl7Item`.

Each trace entry records:

- item ID;
- sequence;
- target path;
- execution status;
- source references;
- source-read evidence;
- input values;
- output value; and
- validation issues.

Source-read evidence includes:

- source path, such as `PID-5.1`;
- resolved value;
- lookup status;
- segment index;
- raw segment; and
- raw field.

## Source lookup helpers

The mapping engine exposes helper functions so HL7 traversal stays in one
place:

```text
readSource()
readSourceValue()
getSegmentsByName()
getOrderGroups()
```

These helpers support field, component, and subcomponent reads. They also
return non-throwing missing statuses such as `missing_segment`,
`missing_field`, and `missing_component`.

## Deterministic rules

The executor follows these rules:

- Validate the profile before execution.
- Reject archived profiles.
- Sort `hl7Item`s by ascending `sequence`.
- Read all declared sources through `source-lookup`.
- Write values to `normalizedDraft` by target path.
- Record a trace entry for every item.
- Convert missing required values into validation errors.
- Convert declared but unimplemented complex transforms into info issues.

## Current implemented actions

The generic executor currently supports:

- `extract`
- `validate`
- `default_value`
- `normalize_date`
- `normalize_timestamp`
- `join`

These names deliberately differ slightly from the original planning shorthand:
`copy` maps to `extract`, `constant` maps to `default_value`, `combine` maps to
`join` or `compose`, `lookup` is handled through source references and
`source-lookup`, `format` maps to normalization actions or named transforms,
and `map-code` is represented as `map_code`. `coalesce` is still planned as
transform-pipeline behavior rather than a standalone action.

The default profile also declares future complex transforms, such as:

- `preferIdentifierType`
- `mapXpnName`
- `mapRepeatingXadAddresses`
- `mapRepeatingXtnTelecom`
- `mapRepeatingIn1Coverage`
- `mapOptionalGt1Guarantor`
- `mapOrcOrderGroups`

These are intentionally reported as pending transforms until specialized
mapping helpers are implemented.

## Current scope

Currently implemented:

- versioned client profile contract;
- draft, published, and archived profile rules;
- deterministic `hl7Item` ordering and dependency validation;
- built-in default OML^O21 profile;
- generic mapping executor;
- source lookup helpers;
- source-read execution evidence;
- deterministic execution tests; and
- documentation for profile and execution behavior.

Known next work:

- implement specialized patient mapping helpers;
- implement coverage and guarantor object composers;
- implement ORC/TQ1/OBR/SPM lab-order grouping;
- compare full normalized output against the expected fixture; and
- connect mapping results to the guided review UI.
