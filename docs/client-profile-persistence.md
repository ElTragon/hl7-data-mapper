# Client profile persistence requirements

Client profile persistence stores reusable mapping configuration and audit
metadata. It must not store source HL7 messages, extracted patient data, or real
PHI.

The production-style storage target is Cloudflare D1. The public portfolio demo
uses built-in read-only profiles and browser storage for temporary recruiter
changes.

## Allowed D1 data

D1 may store configuration and audit records only:

- `clients`
- `mapping_profiles`
- `mapping_versions`
- `hl7_items`
- `audit_events`

These records describe who the mapping belongs to, which mapping version exists,
which ordered `hl7Item` rules are part of that version, and what safe
configuration events occurred.

## Prohibited D1 data

D1 must not store:

- raw HL7 message text;
- uploaded source files;
- normalized patient output;
- extracted patient names;
- MRNs or other patient identifiers;
- dates of birth;
- addresses or phone numbers from messages;
- coverage values copied from an HL7 message;
- guarantor values copied from an HL7 message;
- laboratory order payloads copied from a message; or
- any real PHI.

In short: D1 can store mapping rules and safe metadata. It cannot store message
content or extracted patient data.

## Required storage boundaries

### Clients

`clients` may store non-PHI client configuration, such as:

- client ID;
- display name;
- status;
- creation timestamp; and
- update timestamp.

Client IDs must not include patient identifiers or message-specific values.

### Mapping profiles

`mapping_profiles` may store profile-level configuration, such as:

- profile ID;
- client ID;
- profile display name;
- supported HL7 version;
- supported message type;
- supported message structure; and
- current published version pointer.

### Mapping versions

`mapping_versions` may store version metadata, such as:

- profile ID;
- profile version number;
- status: `draft`, `published`, or `archived`;
- version this draft was based on;
- created timestamp;
- updated timestamp;
- published timestamp; and
- archived timestamp.

Draft versions may change. Published versions are immutable. Changes to a
published version must create a new draft version.

### hl7 items

`hl7_items` may store ordered mapping instructions for one mapping version:

- item ID;
- client ID;
- profile ID;
- profile version;
- execution sequence;
- review section;
- normalized target path;
- source references such as `PID-5.1`;
- action;
- value type;
- dependencies;
- transform configuration;
- required/reviewable flags; and
- implementation notes.

`hl7_items` must describe how to find values. They must not store the values
found in a specific message.

### Audit events

`audit_events` may store safe events, such as:

- client created;
- profile created;
- draft edited;
- source changed;
- profile published;
- profile archived;
- mapping run completed; and
- mapping run failed.

Audit events may include safe metadata, such as profile version, event type,
message hash, validation counts, and timestamps. They must not include raw
message text or extracted patient data.

The shared contract is `AuditEventSchema` in
`packages/contracts/src/persistence.ts`.

Safe audit metadata may include counts, statuses, IDs, timestamps, and field
names. It must not include raw HL7, normalized patient data, or extracted
message values.

## Mapping run metadata

Each mapping run should record enough safe metadata to prove which rules ran:

- run ID;
- client ID;
- profile ID;
- profile version;
- message hash;
- message type;
- HL7 version;
- message structure;
- run timestamp;
- result status;
- validation error count;
- validation warning count; and
- validation info count.

The message hash should be calculated from the source message, but the source
message itself must not be stored.

The shared contract is `MappingRunMetadataSchema` in
`packages/contracts/src/persistence.ts`.

Think of this like a library checkout receipt: it says which rulebook was used
and when, but it does not copy the whole book into the receipt.

## D1 schema design

The schema below is the planned production-style D1 shape. It is intentionally
limited to configuration and safe metadata.

## TypeScript record contracts

The D1 row shapes are represented in `packages/contracts/src/persistence.ts`.

| D1 table           | TypeScript schema            | Purpose                                       |
| ------------------ | ---------------------------- | --------------------------------------------- |
| `clients`          | `ClientRecordSchema`         | Non-PHI client configuration                  |
| `mapping_profiles` | `MappingProfileRecordSchema` | Long-lived profile container                  |
| `mapping_versions` | `MappingVersionRecordSchema` | Draft, published, or archived profile version |
| `hl7_items`        | `Hl7ItemRecordSchema`        | Ordered mapping rules for one version         |
| `audit_events`     | `AuditEventRecordSchema`     | Safe audit metadata stored as JSON            |

These contracts are intentionally strict. Extra fields are rejected so raw HL7
or extracted patient data cannot sneak into persistence records by accident.

### `clients`

Stores non-PHI client records.

```sql
create table clients (
  client_id text primary key,
  display_name text not null,
  status text not null check (status in ('active', 'inactive', 'archived')),
  created_at text not null,
  updated_at text not null
);
```

Indexes:

```sql
create index idx_clients_status on clients (status);
```

Notes:

- `client_id` must be a stable non-PHI slug.
- `display_name` must not include patient identifiers or message-specific
  values.

### `mapping_profiles`

Stores the long-lived profile container for one client and message workflow.

```sql
create table mapping_profiles (
  profile_id text primary key,
  client_id text not null references clients (client_id),
  display_name text not null,
  description text,
  hl7_version text not null,
  message_type text not null,
  message_structure text not null,
  current_published_version integer,
  created_at text not null,
  updated_at text not null
);
```

Indexes:

```sql
create index idx_mapping_profiles_client_id
  on mapping_profiles (client_id);

create unique index idx_mapping_profiles_client_message
  on mapping_profiles (client_id, hl7_version, message_type, message_structure);
```

Notes:

- For the MVP, `hl7_version` is `2.5.1`.
- For the MVP, `message_type` is `OML^O21`.
- For the MVP, `message_structure` is `OML_O21`.

### `mapping_versions`

Stores immutable and editable versions of a mapping profile.

```sql
create table mapping_versions (
  profile_id text not null references mapping_profiles (profile_id),
  profile_version integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  based_on_profile_version integer,
  created_at text not null,
  updated_at text not null,
  published_at text,
  archived_at text,
  primary key (profile_id, profile_version)
);
```

Indexes:

```sql
create index idx_mapping_versions_status
  on mapping_versions (status);

create index idx_mapping_versions_profile_status
  on mapping_versions (profile_id, status);
```

Rules:

- Draft versions can change.
- Published versions are immutable.
- Archived versions are read-only.
- A profile should have at most one active draft at a time.
- Publishing a draft sets `published_at`.
- Editing a published version creates a new draft with
  `based_on_profile_version` set.
- Version numbers must only move forward.
- A mapping run references the exact `profile_id` and `profile_version` used.

D1 does not enforce all lifecycle rules by itself. Application code must enforce
immutability and draft creation rules.

### `hl7_items`

Stores ordered mapping instructions for one profile version.

```sql
create table hl7_items (
  profile_id text not null,
  profile_version integer not null,
  item_id text not null,
  client_id text not null references clients (client_id),
  sequence integer not null,
  section text not null,
  target_path text not null,
  label text not null,
  action text not null,
  value_type text not null,
  sources_json text not null default '[]',
  depends_on_json text not null default '[]',
  transform_json text,
  required integer not null default 1,
  review_required integer not null default 1,
  default_value_json text,
  notes text,
  created_at text not null,
  updated_at text not null,
  primary key (profile_id, profile_version, item_id),
  foreign key (profile_id, profile_version)
    references mapping_versions (profile_id, profile_version)
);
```

Indexes:

```sql
create unique index idx_hl7_items_sequence
  on hl7_items (profile_id, profile_version, sequence);

create index idx_hl7_items_target_path
  on hl7_items (profile_id, profile_version, target_path);
```

Notes:

- JSON columns store mapping configuration, not patient data.
- `sources_json` stores source references such as `PID-5.1`.
- `transform_json` stores transform configuration such as
  `normalize_timestamp` settings.
- `default_value_json` must not contain PHI or extracted message values.

### `audit_events`

Stores safe audit metadata for profile and mapping events.

```sql
create table audit_events (
  event_id text primary key,
  event_type text not null,
  actor_type text not null,
  actor_id text,
  client_id text references clients (client_id),
  profile_id text,
  profile_version integer,
  message_hash text,
  metadata_json text not null default '{}',
  created_at text not null
);
```

Indexes:

```sql
create index idx_audit_events_client_created
  on audit_events (client_id, created_at);

create index idx_audit_events_profile_version
  on audit_events (profile_id, profile_version);

create index idx_audit_events_message_hash
  on audit_events (message_hash);
```

Notes:

- `message_hash` may identify that the same source message was used again
  without storing the message.
- `metadata_json` may contain safe counts, statuses, and field names.
- `metadata_json` must not contain raw HL7, normalized patient data, or
  extracted message values.

Code-level guardrails:

- `ClientRecordSchema`, `MappingProfileRecordSchema`, and
  `MappingVersionRecordSchema` validate safe profile storage rows.
- `Hl7ItemRecordSchema` validates mapping-rule rows and rejects unsafe default
  values.
- `AuditEventRecordSchema` validates database-shaped audit rows.
- `MappingRunMetadataSchema` rejects extra fields such as `rawMessage`.
- `AuditEventSchema` validates audit-event shape.
- `SafeAuditMetadataSchema` rejects unsafe metadata keys such as `rawMessage`,
  `patientName`, `mrn`, and `dateOfBirth`.
- `SafeAuditMetadataSchema` rejects raw HL7 segment text such as `MSH|...`.

## Relationship overview

```text
clients
  └── mapping_profiles
        └── mapping_versions
              └── hl7_items

audit_events
  ├── client_id
  ├── profile_id
  ├── profile_version
  └── message_hash
```

## Schema privacy checklist

Before adding a new column, ask:

1. Is this value configuration or metadata?
2. Could this value identify a patient?
3. Did this value come from an HL7 message payload?
4. Would this value be unsafe in a public demo database?

If the answer to questions 2, 3, or 4 is yes, the value does not belong in D1.

## Public demo behavior

The public demo has stricter rules than the production-style design:

- built-in profiles are read-only;
- recruiter changes remain in browser storage;
- no publicly accessible database writes are allowed;
- no raw HL7 messages are persisted;
- no extracted patient data is persisted;
- demo changes can be cleared by refreshing/resetting the session; and
- everything must reset safely.

The public demo may simulate profile edits so reviewers can see the workflow,
but those edits should not write to D1.

The shared contract is `DemoPersistencePolicySchema` in
`packages/contracts/src/persistence.ts`.

The public demo policy is:

```text
mode: public_demo
builtInProfilesReadOnly: true
recruiterChangesStorage: browser
allowPublicDatabaseWrites: false
persistRawMessages: false
persistExtractedPatientData: false
resetClearsRecruiterChanges: true
```

In plain English: reviewers can try the workflow, but they cannot permanently
write to a public database. Demo edits are temporary, local, and safe to reset.

## Public demo reset behavior

Reset should clear:

- draft profile edits created during the demo;
- guided-review decisions;
- selected alternate sources;
- correction intents; and
- temporary audit-like browser events.

Reset should not need a server call because the public demo does not depend on
public database writes.

## Privacy position

This project is HIPAA-aware, not HIPAA compliant by source code alone. Real PHI
would require the right infrastructure, agreements, policies, access controls,
audit controls, and organizational risk assessment.

For this repository, the persistence rule is simple: store mapping
configuration, version metadata, and safe audit metadata only.
