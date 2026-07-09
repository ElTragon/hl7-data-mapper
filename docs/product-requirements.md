# HL7 Data Mapper: MVP Product Requirements

## 1. Purpose

HL7 Data Mapper helps an implementation or solutions engineer onboard a
client's HL7 v2 laboratory-order feed. The user can provide a message, inspect
the default extraction, correct client-specific assumptions, confirm each
business field, and export a reproducible handoff package.

The MVP supports one declared profile well instead of presenting itself as a
general HL7 conformance engine.

## 2. Primary user and problem

### Primary user

An implementation, integration, solutions, or forward-deployed engineer
working with a laboratory or healthcare client.

### Problem

HL7 v2 integrations often use the same standard fields differently across
clients. Engineers need a transparent way to:

- understand what a message contains;
- show where each extracted value came from;
- confirm assumptions with a client;
- save client-specific mapping rules without modifying application code; and
- produce documentation that another engineer can reproduce.

## 3. MVP scope

### Supported profile

- HL7 version: `2.5.1`
- Message type: `OML`
- Trigger event: `O21`
- Message structure: `OML_O21`
- Business workflow: new laboratory orders
- Data policy: synthetic data only

The application profile requires one patient and at least one laboratory order,
even though the base OML_O21 message structure allows the patient group to be
absent.

### Business data

- message and sender metadata;
- patient identifiers and demographics;
- coverage and subscriber details;
- guarantor details;
- laboratory orders and ordering provider;
- order timing; and
- specimens associated with each order.

“Coverage” does not include card numbers, bank accounts, payment credentials,
or payment processing.

## 4. Explicit non-goals

The MVP does not:

- accept or authorize the use of real PHI;
- collect card or bank information;
- claim complete HL7 v2.5.1 conformance validation;
- convert HL7 v2 to FHIR;
- support production authentication or authorization;
- support multiple HL7 versions or trigger events;
- receive messages over MLLP;
- send HL7 acknowledgements;
- process observation results as a primary workflow;
- persist uploaded source messages or extracted patient data; or
- claim that the repository or public deployment is HIPAA compliant.

## 5. Product workflow

1. The user identifies the client with a non-PHI client ID.
2. The user uploads, pastes, or generates a synthetic OML^O21 message.
3. The user edits the raw message if necessary.
4. The application parses the message and applies the default mapping profile.
5. The user reviews patient, sender, coverage, guarantor, and order sections.
6. Each field displays its value, HL7 source, applied transforms, and warnings.
7. The user confirms the value, marks it unavailable, or changes its mapping.
8. Mapping changes are saved as a draft client profile.
9. A completed review can publish an immutable profile version.
10. The user downloads a report ZIP.

## 6. Functional requirements

### FR-1: Message input

- Accept `.hl7` and `.txt` uploads up to 1 MiB.
- Accept pasted text.
- Generate a built-in synthetic OML^O21 example.
- Preserve the submitted text while allowing edits before parsing.
- Normalize CRLF and LF segment endings to HL7 carriage returns internally.
- Never upload or persist a message until the user explicitly parses it.

### FR-2: Profile checks

The MVP validator must:

- detect field and encoding delimiters from MSH;
- require MSH as the first segment;
- verify `MSH-9` is `OML^O21^OML_O21`;
- verify `MSH-12` is `2.5.1`;
- require a PID segment for the application profile;
- require at least one ORC and associated OBR;
- warn when an order has no SPM;
- identify malformed segment names and inaccessible fields; and
- distinguish errors that block review from warnings that allow review.

These checks validate the application profile, not the entire HL7 standard.

### FR-3: Default extraction

- Apply the defaults in `docs/supported-hl7-fields.md`.
- Preserve repeating IN1 coverage records.
- Preserve repeating ORC order groups.
- Associate TQ1, OBR, and SPM segments with the correct ORC group.
- Preserve repeating SPM specimens within an order.
- Prefer a PID-3 repetition with identifier type `MR`; otherwise use the first
  non-empty PID-3 repetition.
- Prefer ORC-12 for the ordering provider and fall back to OBR-16.
- Prefer OBR order numbers and fall back to the corresponding ORC values.
- Return `null` for absent optional values; never infer clinical data.

### FR-4: Guided review

Review sections appear in this order:

1. Patient information
2. Sender/client information
3. Coverage and guarantor
4. Lab orders
5. Warnings and missing fields

Every collected field must expose:

- normalized value;
- source path, such as `PID-5.1`;
- repetition and order-group context;
- raw segment context;
- transform history;
- validation messages; and
- review status.

Review statuses are:

- `unreviewed`
- `confirmed`
- `incorrect`
- `mapping_changed`
- `unavailable`

Corrections must update or create `hl7Item` mapping instructions. The UI must
not treat a corrected value as a one-off display override.

Warnings and missing-field review must include validation issues and
non-successful HL7 source reads, including missing fields and empty values.

### FR-5: hl7Item mapping model

An `hl7Item` represents one atomic mapping operation:

```json
{
  "id": "patient-family-name",
  "clientId": "northstar-lab",
  "sequence": 2,
  "section": "patient",
  "targetPath": "patient.name.family",
  "label": "Patient family name",
  "action": "split",
  "valueType": "string",
  "sources": [],
  "dependsOn": ["patient-name-raw"],
  "transform": {
    "name": "selectComponent",
    "description": "Select the first XPN component as family name.",
    "params": {
      "component": 1
    }
  },
  "required": true,
  "reviewRequired": true
}
```

Supported MVP operations:

- `extract`
- `split`
- `join`
- `map_code`
- `normalize_date`
- `normalize_timestamp`
- `default_value`
- `validate`
- `compose`

Multiple items may contribute to one final field. Dependencies reference item
IDs and must form an acyclic graph. Item execution must be deterministic.

### FR-6: Client mapping profiles

- A client has one or more mapping-profile versions.
- A profile declares its supported HL7 version and message structure.
- Draft versions may change.
- Published versions are immutable.
- Creating a change from a published version creates a new draft.
- New draft versions must record which published version they were based on.
- Version numbers must only move forward.
- Archived versions can be read for history but cannot run new mappings.
- The public demo stores user-created drafts in browser storage only.
- Built-in sample profiles are read-only.
- Public demo reset clears browser-stored drafts, review decisions, selected
  alternate sources, correction intents, and temporary demo events.
- A mapping run records the profile version and SHA-256 source-message hash,
  but not the source message or extracted PHI.
- Mapping run metadata may include validation counts, result status, message
  type, HL7 version, and message structure.
- Audit events may include safe configuration metadata but must reject raw HL7
  text and patient-like payload keys.
- D1 may store clients, mapping profiles, mapping versions, `hl7Item`s, and
  audit events.
- D1 must not store raw messages, extracted patient data, normalized patient
  payloads, or real PHI.
- D1 tables must support immutable published profile versions, ordered
  `hl7Item` lookup, and safe audit-event search by client, profile version, and
  message hash.
- D1 row contracts must reject extra fields and unsafe JSON metadata.
- Public demo changes remain in browser storage and must not perform publicly
  accessible database writes.
- Public demo policy must reject raw-message persistence, extracted-patient-data
  persistence, and public database writes.
- Public demo browser storage may keep draft profile copies, review decisions,
  correction intents, and safe temporary demo events only.
- Public demo reset must replace browser storage with an empty safe snapshot.

### FR-7: Report export

The browser generates a ZIP containing:

```text
source.hl7
normalized-data.json
hl7-items.json
validation-results.json
review-decisions.json
mapping-summary.csv
REPORT.md
manifest.json
```

The manifest includes:

- client ID;
- profile version;
- application version;
- message control ID;
- generation timestamp;
- source-message SHA-256 hash; and
- SHA-256 hash for every report file.

The ZIP is generated on demand and is not persisted by the public demo.

## 7. Normalized output contract

The normalized output contains:

```text
schemaVersion
clientId
generatedAt
message
sender
patient
coverages[]
guarantor
labOrders[]
```

The canonical example is
`fixtures/expected/oml-o21-basic.normalized.json`.

Rules:

- JSON keys use camelCase.
- Empty optional scalar values are `null`.
- Repeating concepts are arrays, including when one value is present.
- Dates use `YYYY-MM-DD`.
- Timestamps use ISO 8601 and preserve the source UTC offset when supplied.
- Codes retain code, display text, and coding system independently.
- Identifiers retain assigning authority and identifier type when supplied.
- The normalized object contains business values; mapping provenance is
  emitted separately in the report.
- Field-level review data uses the `NormalizedField` contract outside the clean
  normalized business object.

## 8. Privacy and security requirements

- Every screen that accepts a message states “Synthetic data only.”
- Fixtures use invented names, identifiers, addresses, and organizations.
- Source messages and normalized patient data remain in memory unless the user
  downloads a report.
- PHI-like message content must not appear in URLs, analytics, logs, traces, or
  uncaught error reports.
- The application must not load third-party analytics in the MVP.
- Client IDs must not contain patient identifiers.
- Documentation describes the design as HIPAA-aware, not HIPAA compliant.

## 9. MVP acceptance criteria

The MVP requirements are accepted when:

- the supported field matrix is documented;
- the normalized example matches that matrix;
- a valid fixture contains two independent order groups;
- the two orders retain their own identifiers, timing, provider, and specimen;
- an invalid fixture demonstrates a missing application-required PID;
- a client-variant fixture demonstrates repeating patient identifiers and a
  local test code;
- all fixture values are explicitly synthetic;
- scope and non-goals are visible in the repository; and
- formatting, tests, lint, and build checks pass.

The implemented MVP is accepted later when a user can complete the documented
workflow without changing source code.

## 10. Reference material

- [HL7 v2.5.1 Chapter 2: Control](https://www.hl7.eu/HL7v2x/v251/std251/ch02.html)
- [HL7 v2.5.1 Chapter 3: Patient Administration](https://www.hl7.eu/HL7v2x/v251/std251/ch03.html)
- [HL7 v2.5.1 Chapter 4: Order Entry](https://www.hl7.eu/HL7v2x/v251/std251/ch04.html)
- [HL7 v2.5.1 Chapter 6: Financial Management](https://www.hl7.eu/HL7v2x/v251/std251/ch06.html)
- [HL7 v2.5.1 Chapter 7: Observation Reporting](https://www.hl7.eu/HL7v2x/v251/std251/ch07.html)
