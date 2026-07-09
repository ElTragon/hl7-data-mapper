# Contracts

Shared TypeScript contracts for the HL7 Data Mapper workspace.

This package owns the validated shapes that the rest of the app agrees on:

- normalized extraction output
- `hl7Item` mapping steps
- source references back to HL7 fields
- normalized field review metadata
- guided review workflow metadata
- versioned client profile metadata
- review statuses
- validation summaries
- report package metadata

It should stay free of UI, file-upload, and parser implementation details. That keeps the normalized data model stable even as the React app, parser, and mapping engine evolve independently.

## Current contracts

- `NormalizedOutputSchema`: clean business data for OML^O21 lab orders.
- `SourceReferenceSchema`: one-based HL7 source paths such as `PID-5.1`.
- `NormalizedFieldSchema`: review/provenance wrapper for collected values.
- `ReviewableFieldSchema`: UI-ready field evidence for guided review.
- `GuidedReviewProgressSchema`: section-level counts for review navigation.
- `Hl7ItemSchema`: one atomic client-specific mapping instruction.
- `Hl7ItemSetSchema`: ordered mapping rules for one client and profile.
- `ClientProfileSchema`: versioned client profile metadata and `hl7Item` set.
- Client profile lifecycle helpers: publish drafts, create new draft versions,
  archive published versions, and check edit/execution permissions.
- `MappingRunMetadataSchema`: safe mapping-run receipt with profile version and
  message hash but no message payload.
- `AuditEventSchema`: safe audit event metadata for profile and mapping events.
- `DemoPersistencePolicySchema`: public-demo storage policy that keeps built-in
  profiles read-only and recruiter changes in browser storage.
- `DemoBrowserStorageSnapshotSchema`: browser-only demo scratchpad for draft
  profile copies, review decisions, correction intents, and safe demo events.
- Demo browser storage helpers: create or reset an empty safe browser snapshot.
- D1 record schemas: `ClientRecordSchema`, `MappingProfileRecordSchema`,
  `MappingVersionRecordSchema`, `Hl7ItemRecordSchema`, and
  `AuditEventRecordSchema`.
- `ReportManifestSchema`: report table of contents with app version, profile
  version, message hash, source policy, and per-payload-file hashes.
- `ReportPackagePlanSchema`: report-generation handoff shape for manifest,
  `hl7Item`s, review decisions, validation results, and mapping summary columns.
- `ValidationIssueSchema`: structured errors, warnings, and info messages.

More detail: [../../docs/normalized-data-model.md](../../docs/normalized-data-model.md)

Client profile rules: [../../docs/client-profiles.md](../../docs/client-profiles.md)

Guided review workflow: [../../docs/guided-review.md](../../docs/guided-review.md)

Report generation: [../../docs/report-generation.md](../../docs/report-generation.md)
