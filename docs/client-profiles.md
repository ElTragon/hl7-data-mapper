# Versioned client profiles

Client profiles turn a default HL7 mapping into a client-specific mapping
rulebook.

The profile is versioned so an implementation engineer can safely change a
draft without rewriting history for a mapping that was already reviewed or
published.

The contracts and mapping engine implement profile validation, version
lifecycle helpers, and execution. The current web demo uses one bundled profile
and creates a browser draft for source corrections. It does not offer client
creation, profile selection, or publishing controls; persistent profile storage
is planned.

## Profile contract

`ClientProfileSchema` contains:

```text
clientId
profileId
profileVersion
status
displayName
description?
hl7Version
messageType
messageStructure
createdAt
updatedAt
publishedAt?
archivedAt?
basedOnProfileVersion?
itemSet
```

The MVP profile is intentionally narrow:

- HL7 version: `2.5.1`
- Message type: `OML^O21`
- Message structure: `OML_O21`

The `itemSet` contains the ordered `hl7Item` rules that map parsed HL7 values
into normalized output fields.

Each [`Hl7Item`](../packages/contracts/src/hl7-item.ts) names a normalized
`targetPath`, its `sources`, an `action`, optional named `transform`, and a
positive `sequence`. It can refer to earlier item IDs through `dependsOn`.
`required` controls missing-output errors, while `sourceExpectations` describe
what a reviewer should expect at a source and help classify missing-source
issues. `reviewRequired` is part of the contract, but current report completion
checks every mapping item and emitted record leaf rather than using that flag
as an exemption. A rule stores **how** to find a value; the result and raw
source evidence are kept separately during execution.

[`Hl7ItemSetSchema`](../packages/contracts/src/hl7-item.ts) rejects duplicate
IDs or sequences, an item with a different client ID, unknown dependencies,
and dependencies whose sequence is not earlier. These checks make execution
order explicit. The profile schema also requires its item set to declare the
same client ID, HL7 version, and message type as the profile.

## Built-in default profile

The mapping engine includes a published default profile:

```text
packages/mapping-engine/src/profiles/default-oml-o21-profile.ts
```

This profile is the current demo's starting point. It declares mappings for:

- message and sender metadata from `MSH`;
- patient identifiers, demographics, addresses, and telecom from `PID`;
- coverage fields from `IN1`;
- optional guarantor data from `GT1`; and
- laboratory-order fields from `ORC`, `TQ1`, `OBR`, and `SPM`.

The web app makes a draft copy before a reviewer changes a source. The default
profile itself is published and read-only. The built-in profile and browser
export already preserve repeated addresses, telecom, coverages, orders, and
specimens with source evidence. Selecting other clients in the UI is planned;
see [mapping execution](mapping-execution.md) for current repeat behavior.
The bundled profile is published version 1; starting a review normally creates
an editable version 2 draft based on version 1, or reuses a compatible saved
draft. A source correction changes the draft rule and reruns mapping. Completing
review does not publish it.

## Profile statuses

Profiles can be:

```text
draft
published
archived
```

Rules:

- Draft profiles can be edited.
- Draft profiles must not have `publishedAt` or `archivedAt`.
- Published profiles must have `publishedAt`.
- Published profiles are treated as immutable by the application workflow.
- Editing a published profile should create a new draft version.
- Archived profiles must have both `publishedAt` and `archivedAt`.
- Archived profiles can be read for audit/history but cannot run new mappings.

The contracts expose helper functions for these transitions:

- `publishDraftClientProfile(profile, publishedAt)`;
- `createDraftClientProfileVersion({ sourceProfile, nextProfileVersion, createdAt })`;
- `archivePublishedClientProfile(profile, archivedAt)`;
- `canEditClientProfile(profile)`; and
- `canExecuteClientProfile(profile)`.

## Version behavior

Each mapping profile can have many versions. The version number is part of the
identity of the mapping rules.

Version rules:

- Version numbers only move forward.
- A draft profile can be edited in place.
- A published profile cannot be edited in place.
- Changing a published profile creates a new draft version.
- The new draft records `basedOnProfileVersion`.
- Publishing a draft preserves the same version number and sets `publishedAt`.
- Archiving a published version sets `archivedAt` and prevents future mapping
  execution.

Example lifecycle:

```text
version 1 draft
  -> publish
version 1 published
  -> create new draft from published version
version 2 draft based on version 1
  -> publish
version 2 published
```

Reports record the profile version used. Persisted audit events are planned.

## Deterministic mapping execution

The same HL7 input plus the same profile contents must produce the same output
and mapping evidence. Draft profiles can be edited without changing their
version number; a published profile version is immutable.

Execution rules:

- `hl7Item`s execute by ascending `sequence`.
- Duplicate `hl7Item` IDs are invalid.
- Duplicate sequence numbers are invalid.
- Dependencies must reference existing `hl7Item` IDs.
- Dependencies must point to items with lower sequence numbers.
- Forward dependencies are invalid.
- Required missing values become validation errors.
- Optional missing scalars can become `null`; array composers can return `[]`.

The contracts expose `sortHl7ItemsForExecution()` so the mapping engine has one
shared rule for execution order.

The mapping engine also exposes source lookup helpers for deterministic reads:

- `readSource()`
- `readSourceValue()`
- `getSegmentsByName()`
- `getOrderGroups()`

These helpers keep raw HL7 traversal out of the item executor. Coverage,
guarantor, and lab-order composers and named transforms are implemented. The
built-in profile preserves repeated records and their source evidence through
browser export, as described in [mapping execution](mapping-execution.md).

## Mapping execution result

The mapping engine exposes `executeMapping()`.

It accepts:

```text
parsedMessage
profile
```

It returns:

```text
profile
normalizedDraft
normalizedFields
validation
executionTrace
```

`normalizedDraft` is partial output from ordered `hl7Item` execution. The web
export merges it with default-composer output and validates the result.
`normalizedFields` and `executionTrace` show what each `hl7Item` read and
produced for review and reporting.

Each execution trace entry records:

- item ID;
- sequence;
- target normalized path;
- execution status;
- source references;
- resolved source-read evidence;
- input values;
- output value; and
- validation issues.

## Why this matters

Versioned profiles make the project feel like a real implementation tool:

- support engineers can show exactly which profile version produced a result;
- published mappings do not silently change;
- review and report artifacts can reference a stable profile version; and
- deterministic execution makes tests, debugging, and client handoff easier.

## Persistence boundary

Profile persistence may store client records, profile metadata, version
metadata, ordered `hl7Item` rules, and safe audit events.

It must not store raw HL7 messages, uploaded source files, normalized patient
output, or extracted patient data.

The planned D1 schema includes `clients`, `mapping_profiles`,
`mapping_versions`, `hl7_items`, and `audit_events`, with indexes for client
lookup, profile-version lookup, deterministic `hl7Item` ordering, and audit
history. This schema is not a completed runtime persistence layer yet; current
code defines the contracts and safety boundary first.

Persistence requirements: [client-profile-persistence.md](client-profile-persistence.md)

## Changing a profile rule

1. Find the target in the [supported field matrix](supported-hl7-fields.md)
   and its item in the [built-in profile](../packages/mapping-engine/src/profiles/default-oml-o21-profile.ts).
2. Check that its action or named transform is actually supported by the
   [executor](../packages/mapping-engine/src/execution/supported-transforms.ts).
   The contract lists some future actions that have no generic execution yet.
3. Change the source/transform and its `sourceExpectations` together, so the
   review guidance still describes what the rule reads. For repeated records,
   also check [repeat expansion](../packages/mapping-engine/src/execution/repeated-inputs.ts)
   and [record correction replay](../packages/mapping-engine/src/execution/record-correction-identity.ts).
4. Check the [default composer](../packages/mapping-engine/src/default-composers.ts),
   because browser export merges it with the profile result. Run the
   [profile tests](../packages/mapping-engine/src/profiles/default-oml-o21-profile.test.ts),
   [execution tests](../packages/mapping-engine/src/execution/execute-mapping.integration.test.ts),
   and relevant web/report tests.

Keep the original published built-in profile immutable at runtime; browser
review changes belong to a draft copy. A new message type would also require
contract, parser, composer, and report changes because the current schemas and
manifest metadata are fixed to OML/O21 version 2.5.1.

See the [documentation index](README.md) for the complete reading path.
