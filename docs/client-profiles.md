# Versioned client profiles

Client profiles turn a default HL7 mapping into a client-specific mapping
rulebook.

The profile is versioned so an implementation engineer can safely change a
draft without rewriting history for a mapping that was already reviewed or
published.

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

## Built-in default profile

The mapping engine includes a published default profile:

```text
packages/mapping-engine/src/profiles/default-oml-o21-profile.ts
```

This profile is the starting point for every OML^O21 client. It covers:

- message and sender metadata from `MSH`;
- patient identifiers, demographics, addresses, and telecom from `PID`;
- coverage records from repeating `IN1`;
- optional guarantor data from `GT1`; and
- laboratory order groups from `ORC`, `TQ1`, `OBR`, and `SPM`.

Client-specific profiles should begin as a draft copy of this default profile.
The default profile itself is published and read-only.

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

This lets reports and audit events point to the exact profile version that ran.

## Deterministic mapping execution

The same HL7 input plus the same profile version must produce the same output
and mapping evidence.

Execution rules:

- `hl7Item`s execute by ascending `sequence`.
- Duplicate `hl7Item` IDs are invalid.
- Duplicate sequence numbers are invalid.
- Dependencies must reference existing `hl7Item` IDs.
- Dependencies must point to items with lower sequence numbers.
- Forward dependencies are invalid.
- Required missing values become validation errors.
- Optional missing values become `null`.

The contracts expose `sortHl7ItemsForExecution()` so the mapping engine has one
shared rule for execution order.

The mapping engine also exposes source lookup helpers for deterministic reads:

- `readSource()`
- `readSourceValue()`
- `getSegmentsByName()`
- `getOrderGroups()`

These helpers keep raw HL7 traversal out of the item executor and make future
coverage, guarantor, and lab-order composers easier to test.

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

`normalizedDraft` is intentionally named as a draft because the generic
executor can run simple source reads and validations before the specialized
object composers are complete. `normalizedFields` and `executionTrace` are the
review/report evidence that show what each `hl7Item` read and produced.

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
history.

Persistence requirements: [client-profile-persistence.md](client-profile-persistence.md)
