# Guided review workflow

Guided review walks a user through the values extracted from a synthetic
OML/O21 message and asks them to confirm whether each mapping is correct for
the client.

The goal is not just to edit displayed text. When the user finds a bad mapping,
the application should update the client-specific `hl7Item` instructions so the
same source message maps correctly the next time.

## Review steps

The initial guided workflow uses five sections:

1. Patient information
2. Sender/client information
3. Coverage and guarantor
4. Lab orders
5. Warnings and missing fields

Each section should show a short progress summary, such as how many fields are
confirmed, changed, unavailable, or still unreviewed.

## Review field model

Every reviewable field should provide enough context for a user to answer,
“Did we collect this value correctly?”

Each field shows:

- a user-friendly label;
- the normalized target path, such as `patient.name.family`;
- the extracted value;
- the related `hl7Item` ID;
- the primary HL7 source location, such as `PID-5.1`;
- the raw segment where the value came from;
- transform history, such as selecting a component or normalizing a date;
- validation issues and warnings; and
- the current review status.

The shared contract for this shape lives in
`packages/contracts/src/guided-review.ts`.

## Review actions

For each field, the user can:

- confirm the extracted value;
- mark the mapping as incorrect;
- mark the value as unavailable in the source message; or
- select another HL7 source.

Selecting another source should create or update an `hl7Item` correction. The
normalized value should then be regenerated from mapping rules instead of being
manually overwritten in UI state.

## Source selection

When a user selects another HL7 source, the UI should show candidate source
locations with enough evidence to make the choice safe:

- source path;
- raw segment;
- preview value; and
- optional reason the candidate is suggested.

For example, if the default patient identifier used `PID-3[1]` but the client
stores the required MRN in `PID-3[2]`, the correction should update the source
on the patient identifier `hl7Item`.

## Synthetic data boundary

The guided review demo remains synthetic-data-only. Review state, raw segments,
and generated correction metadata may contain patient-like values from the
fixture, so the app should continue to avoid real PHI, analytics capture,
server logs, or external persistence.
