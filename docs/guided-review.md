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

Each section shows a short progress summary:

- total fields;
- unreviewed fields;
- confirmed fields;
- incorrect fields;
- mapping-changed fields; and
- unavailable fields.

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

The mapping-engine implementation that produces these fields lives in
`packages/mapping-engine/src/review-fields.ts`.

## Review actions

For each field, the user can:

- confirm the extracted value;
- mark the mapping as incorrect;
- mark the value as unavailable in the source message; or
- select another HL7 source.

Selecting another source should create or update an `hl7Item` correction. The
normalized value should then be regenerated from mapping rules instead of being
manually overwritten in UI state.

The correction flow is intentionally two-step:

1. `selectAlternateSourceForReviewableField` records the selected HL7 source as
   a correction intent on the review field.
2. `applyReviewFieldCorrectionToProfile` updates the linked `hl7Item` source in
   the draft client profile.

The UI should then re-run mapping with the updated profile so the displayed
value comes from mapping execution, not from a one-off manual override.

`applyReviewCorrectionAndRerunMapping` handles that full loop for the app:

1. apply the selected source correction to the draft client profile;
2. execute mapping again with the updated profile;
3. regenerate review fields from the new mapping result.

This keeps the review screen deterministic. If the same message and same
profile are used again, the same corrected source will be read again.

## Generated review fields

`buildReviewableFields` in `@hl7-data-mapper/mapping-engine` turns a mapping
execution result into `ReviewableField` objects.

That function combines:

- the normalized field value;
- the client profile `hl7Item`;
- the execution trace;
- source-read evidence; and
- validation warnings.

This gives the UI a ready-to-render checklist while keeping mapping logic inside
the mapping package.

## Guided navigation

`buildGuidedReviewNavigation` groups review fields by workflow step and returns
progress counts for each section:

- total fields;
- unreviewed fields;
- confirmed fields;
- incorrect fields;
- mapping-changed fields; and
- unavailable fields.

The UI can use this to show progress such as “Patient information complete” or
“Lab orders still need review.”

## Warnings and missing fields

`buildWarningReviewFields` converts validation issues into reviewable fields in
the warnings step.

It also turns non-successful HL7 source reads into reviewable warning cards.
That includes:

- missing segments;
- missing fields;
- missing repetitions;
- missing components;
- missing subcomponents; and
- empty source values.

This means missing required values, optional-but-empty fields, unsupported
transforms, and other validation issues are not hidden in logs. They become part
of the same guided review flow as patient, sender, coverage, guarantor, and
lab-order data.

## Review status meanings

Review statuses are intentionally separate:

- `unreviewed`: the user has not made a decision yet.
- `confirmed`: the user agrees with the extracted value and source.
- `incorrect`: the user found a problem, but the mapping has not been changed
  yet.
- `mapping_changed`: the mapping rule has been changed.
- `unavailable`: the source message does not contain the needed value.

The distinction between `incorrect` and `mapping_changed` matters. A field can
be marked incorrect before the user selects a replacement source. Once the
replacement source updates the linked `hl7Item`, the app can treat the mapping
as changed.

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

The project is HIPAA-aware in design language, not HIPAA compliant by source
code alone. Real PHI would require appropriate infrastructure, agreements,
access controls, audit controls, policies, and organizational risk assessment.
