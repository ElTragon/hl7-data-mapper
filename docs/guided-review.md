# Guided review workflow

Guided review walks a user through the values extracted from a synthetic
OML/O21 message and asks them to confirm whether each mapping is correct for
the client.

When the user finds a bad mapping, the web app updates `hl7Item` instructions in
a browser draft of the bundled client profile. Re-parsing the same message with
that draft reproduces the corrected mapping. Browser flows for client creation
and publishing are planned; completing review does not publish the draft.

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
- named-transform history when the item declares one (a component choice is
  represented by its source path, and a date-normalization action alone does
  not add a history step);
- validation issues and warnings; and
- the current review status.

The shared contract for this shape lives in
`packages/contracts/src/guided-review.ts`.

The mapping-engine implementation that produces these fields lives in
[`guided-review/build-reviewable-fields.ts`](../packages/mapping-engine/src/guided-review/build-reviewable-fields.ts).
[`review-fields.ts`](../packages/mapping-engine/src/review-fields.ts) re-exports
it from the package's public entry point.

## Review actions

For reviewable fields, the user can:

- confirm the extracted value;
- mark the mapping as incorrect;
- mark the value as unavailable in the source message; or
- select another HL7 source when the field has a linked `hl7Item` and its value
  type supports a source correction. Aggregate arrays and non-string record
  leaves cannot be replaced by a scalar source.

Selecting another source creates or updates an `hl7Item` correction. The
normalized value is then regenerated from mapping rules instead of being
manually overwritten in UI state.

The correction flow is intentionally two-step:

1. `selectAlternateSourceForReviewableField` records the selected HL7 source as
   a correction intent on the review field.
2. `applyReviewFieldCorrectionToProfile` updates the linked `hl7Item` source in
   the draft client profile.

The UI then re-runs mapping with the updated profile so the displayed
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
[`buildReviewableFields`](../packages/mapping-engine/src/guided-review/build-reviewable-fields.ts)
also expands array values into individual record-leaf fields and adds issue
cards from the validation summary. The aggregate array remains reviewable.
Record leaves receive source candidates from their record's execution trace;
the browser UI does not reconstruct those associations by array index alone.

## Guided navigation

`buildGuidedReviewNavigation` groups review fields by workflow step and returns
progress counts for each section:

- total fields;
- unreviewed fields;
- confirmed fields;
- incorrect fields;
- mapping-changed fields; and
- unavailable fields.

The web UI uses this to show progress such as “Patient information complete” or
“Lab orders still need review.”

## Warnings and missing fields

`buildWarningReviewFields` converts validation issues into reviewable fields in
the warnings step.

It also turns non-successful HL7 source reads into reviewable issue cards.
That includes:

- missing segments;
- missing fields;
- missing repetitions;
- missing components;
- missing subcomponents;
- missing parts after a configured literal split; and
- empty source values.

Missing required values, optional-but-empty fields, unsupported transforms,
and other validation issues are not hidden in logs. The issue severity can be
error, warning, or info; optional empty components and subcomponents may be
informational. These cards are part of the same guided review flow as patient,
sender, coverage, guarantor, and lab-order data.

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

## Completion and stale decisions

Progress and export use the same completion rules. A confirmed business field is
resolved unless it has a validation error. An unavailable field is resolved only
when its value is absent and its reason is `source_not_populated` or
`not_applicable`. Incorrect, unreviewed, and mapping-changed fields remain
unresolved. Corrected values must be confirmed again. Empty steps are complete.

The contract has a `reviewRequired` flag on each `hl7Item`, but current
[report completion](../packages/report-generator/src/review-completion.ts)
checks every mapping item, record leaf, and issue. Changing the flag alone
does not remove a field from the completed-report requirements.

Warnings require acknowledgment; informational issues do not. Errors block
completion. Parser, mapping, and source-read issues share stable identities based
on their origin, code, and source/group occurrence, rather than list position.
Acknowledgment never removes an issue from validation results or reports.

When a correction reruns mapping, decisions survive only when the field's value,
source identity, validation, transforms, and mapping/dependency configuration are
unchanged. Unaffected decisions remain intact. Applied correction history survives
later confirmation, incorrect, or unavailable decisions and is exported separately
from the current review status. Review completion does not publish a profile.

The browser stores safe draft rules, structured decisions, and correction
metadata across a refresh. It does not store the message text or extracted
values. To resume an uploaded or pasted message after reloading, the user must
provide the same message and parse it again; decisions restore only when its
fingerprint, client/profile identity and version, mapping revision, and review
engine revision match. Applied correction history can restore across a review
engine revision when the message and draft mapping still match; review decisions
reset under the new revision. Free-text review and correction notes remain in memory
for the active review and report, but are not saved to browser storage. **Reset
demo draft** clears the stored draft and decisions; refreshing alone does not.

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

The grid is the primary source picker. Path and value search remains available
under a secondary toggle. The grid shows each segment at its original one-based
message row and each field under its HL7 field number. Segment, message-row,
and value/path filters do not renumber the rows. A selected `PID-5.1` in message row 2 is shown
as `PID(row 2) × 5.1`; the saved `SourceReference` contains the conventional
path and a zero-based `segmentIndex` of 1. This row coordinate selects the exact
segment in the current message. The grid search accepts that display coordinate,
the compact `PID(2)x5.1` form, and `PIDx5.1` for the first matching PID row. If
a later message moves that segment, a scalar row-pinned rule may need review;
repeated-record corrections use their separate identity checks described below.

After choosing an HL7 field, repetition, component, or subcomponent, a reviewer
can configure a literal separator and a one-based part number. The split applies
to the selected value. A missing part produces `missing_split_part` evidence
instead of silently using another part. Standard HL7 components should normally
be selected by their parsed component positions. For a plain `Mario D. Lopez`
value, splitting on a space can assign parts 3, 1, and 2 to the family, given,
and middle name roles. Each part keeps its own source expectation.

For a scalar report field mapped by a plain string `extract` or `join` rule,
reviewers can assemble an ordered list of sources from different message rows
and fields, choose the exact text between parts, preview the result, and apply
it to that field's existing normalized target. Date, timestamp, and validated
rules retain their existing transforms. Person-name parts continue to use their
named roles. Repeated-record leaf corrections remain single-source because a
multi-source record correction would need identity anchors for every
contributing record.

If any selected source is unavailable in a later message, a source-based join
produces no combined value and reports the missing source for review.

## Synthetic data boundary

The guided review demo remains synthetic-data-only. Review state, raw segments,
and generated correction metadata may contain patient-like values from the
fixture, so the app should continue to avoid real PHI, analytics capture,
server logs, or external persistence.

The project is HIPAA-aware in design language, not HIPAA compliant by source
code alone. Real PHI would require appropriate infrastructure, agreements,
access controls, audit controls, policies, and organizational risk assessment.

## Record corrections and editor lifetime

Array mappings expose individual record fields alongside the aggregate preview.
Choose a record field to change its source; aggregate arrays and structural
sequence numbers cannot be replaced with a scalar source. A record correction is
saved as a dependent mapping item with source-coordinate identity and runs after
its composer, preserving sibling fields. Replay matches the original repetition
or segment occurrence against the current execution trace, then resolves the
selected source's current segment index. Identity metadata contains only
structural coordinates, counts, order-group shape, and a message fingerprint,
never raw HL7 or extracted values. Segment-based coverage, order, and specimen
corrections replay on their original message but block on a changed message:
even a unique current shape could result from moving and changing records. PID
repetition corrections can replay across messages when their repetition
coordinates still match. If the record, selected source, or sibling structure
cannot be matched uniquely,
replay skips the correction and raises a blocking `unresolved-record-identity`
issue. Existing draft corrections without identity metadata remain in the draft
but are blocked until the reviewer replaces them; positional paths are never
trusted on replay. Segment-based corrections saved before the message fingerprint was added also
block until replaced. Decisions saved under an earlier review engine revision
are re-evaluated on reload.

Reparsing or replacing mapping results closes unsaved decision editors. Source
selection resets when the reviewed field changes. Empty, missing, stale, and
incompatible composite source selections do not modify the draft. Completed
reports require decisions for the individual record fields as well as the
aggregate previews.

Correction IDs remain stable when their output positions move. A new correction
gets a distinct ID even when it occupies a previous correction's saved position.
Reports export mapping targets and source coordinates resolved for the current
message; this does not rewrite the saved draft. Completion checks use those
resolved targets and the corresponding replayed review fields.

## Code ownership and change points

The [contracts](../packages/contracts/src/guided-review.ts) define field and
step shapes. The [mapping engine](../packages/mapping-engine/src/guided-review)
builds evidence, navigation, decisions, and correction rules. The pure
[web workflow](../apps/web/src/features/ingestion/ingestion-workflow.ts)
applies those operations and preserves decisions only when field evidence is
unchanged. The [React hook](../apps/web/src/features/ingestion/use-ingestion-workflow.ts)
connects that workflow to state and browser persistence; the
[workspace components](../apps/web/src/features/ingestion/guided-review/guided-review-workspace.tsx)
render it. See [frontend architecture](frontend-architecture.md) for component
and event details.

For a new decision rule, update the
[completion helper](../packages/contracts/src/review-completion.ts) and the
[report generator's independent check](../packages/report-generator/src/review-completion.ts),
then test both interim and completed export. For a new source correction,
update the [profile correction code](../packages/mapping-engine/src/guided-review/profile-corrections.ts),
the [web workflow](../apps/web/src/features/ingestion/ingestion-workflow.ts),
and any storage contract needed for replay. The
[guided-review integration tests](../packages/mapping-engine/src/guided-review/guided-review.integration.test.ts),
[web workflow tests](../apps/web/src/features/ingestion/ingestion-workflow.test.ts),
and [browser journey](../apps/web/tests/e2e/review-workflow.spec.ts)
exercise the important boundaries.

See the [documentation index](README.md) for the complete reading path.
