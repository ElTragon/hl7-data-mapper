# Ingestion Validation Backlog

This checklist tracks planned improvements to the upload, parsing, and
client-specific message-structure workflow. These items are not implemented
unless marked complete.

The parser should preserve message content and describe what it found. A
versioned client profile should decide whether an unexpected structure is
allowed, produces a warning, or blocks review.

## Unknown and client-specific segments

- [ ] Classify every parsed segment as one of the following:
  - supported and configured, such as `PID`, `ORC`, or `OBR`;
  - standard HL7 but unused by the current mapping, such as `NTE`;
  - a client extension using the HL7 `Z` convention, such as `ZPI` or `ZDS`;
  - an unrecognized non-`Z` segment, such as a client-provided `DIP` segment.
- [ ] Add a client-profile policy for unconfigured segments:
  - `allow`: preserve the segment without creating a validation issue;
  - `warn`: preserve the segment and require onboarding review;
  - `reject`: create a blocking validation error.
- [ ] Use these public-demo defaults:
  - allow and preserve standard but unmapped segments;
  - allow unconfigured `Z` segments with a warning;
  - warn for unrecognized non-`Z` segments;
  - validate configured custom segments using their client-profile rules.
- [ ] Let the user resolve an unrecognized segment inline by choosing:
  - add it to the draft client profile;
  - preserve and ignore it;
  - continue with a warning;
  - reject messages containing it.
- [ ] When adding a segment to a profile, collect its expected scope, order,
      occurrence limits, field rules, severity, and business explanation.
- [ ] Store the selected policy and custom-segment definition in the versioned
      client profile so later messages are evaluated consistently.
- [ ] Include unexpected-segment decisions and the applied profile version in
      validation results and the report ZIP.
- [ ] Never guess the business meaning of an unknown or custom segment.

## Remaining ingestion decisions

- [ ] Decide whether files containing multiple HL7 messages are rejected or
      explicitly split into separate messages for the MVP.
- [ ] Define accepted text encodings, byte-order-mark handling, and behavior for
      invalid text bytes.
- [ ] Detect MLLP wrapper characters in uploaded files and decide whether to
      strip them with a warning or reject the input.
- [ ] Define handling for blank lines, unexpected whitespace, and control
      characters without altering meaningful field content.
- [ ] Detect duplicate `MSH` segments and distinguish malformed input from a
      file containing multiple messages.
- [ ] Add required field, repetition, component, value-set, and code
      constraints to client structure profiles.
- [ ] Make each structural rule explicitly blocking or non-blocking.
- [ ] Add repeatable message-group rules so each `OBR`, `TQ1`, and `SPM` is
      associated with the correct `ORC`.
- [ ] Display detected segment endings and all `MSH` delimiters, allow explicit
      parser overrides, and support reset-to-detected behavior.
- [ ] Include applied parse settings and the structure-rule version in the
      generated report.

## Test coverage to add

- [ ] Configured and unconfigured `Z` segments.
- [ ] Standard but unmapped segments.
- [ ] Unrecognized non-`Z` segments under allow, warn, and reject policies.
- [ ] A custom segment becoming recognized after it is added to a draft
      profile.
- [ ] Unknown segments inside repeated order groups.
- [ ] Report reproducibility with identical parse settings and profile versions.
- [ ] Confirmation that raw HL7 and extracted patient data are not persisted by
      these onboarding decisions.
