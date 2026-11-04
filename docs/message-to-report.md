# From one HL7 message to a reviewed report

This is the chronological code path through the **current browser demo**. Follow
it with the [synthetic sample message](../fixtures/valid/oml-o21-basic.hl7)
open beside the [expected normalized JSON](../fixtures/expected/oml-o21-basic.normalized.json).
For the package algorithms, use the linked deep references. The
[documentation index](README.md) gives other reading paths.

The key idea is that the same message exists in several forms for different
jobs. A parsed segment tree explains **where** text was found. A mapping
profile explains **why** it became a business field. Review state records a
person's decision. A report packages the business values, current rules,
decisions, and issues for handoff.

| Form              | Example                                                  | Created by                                                                                               | What it is for                                        |
| ----------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Raw text          | `PID-5 = Lopez^Elena^M`                                  | Editor, upload, or bundled fixture                                                                       | Editable source in browser memory                     |
| Parsed message    | Segment `PID`, field 5, component 1 = `Lopez`            | [`parseHl7Message`](../packages/hl7-parser/src/parse-hl7-message.ts)                                     | Ordered syntax, source coordinates, structural issues |
| Draft profile     | `patient-name` reads `PID-5.1` for family                | [Built-in profile](../packages/mapping-engine/src/profiles/default-oml-o21-profile.ts) copied to a draft | Client-specific extraction recipe                     |
| Mapping result    | `normalizedDraft.patient.name.family = "Lopez"`          | [`executeMapping`](../packages/mapping-engine/src/execution/execute-mapping.ts)                          | Values, source reads, execution trace, validation     |
| Review fields     | `patient-name` with value, source, status, issues        | [`buildReviewableFields`](../packages/mapping-engine/src/guided-review/build-reviewable-fields.ts)       | Evidence and decisions for the UI                     |
| Normalized output | `patient.name.family = "Lopez"`                          | [Web report composition](../apps/web/src/features/ingestion/review-report.ts)                            | Validated business JSON                               |
| Report ZIP        | `normalized-data.json`, rules, decisions, manifest, etc. | [Report generator](../packages/report-generator/src/index.ts)                                            | Downloadable handoff                                  |

```text
Hl7IngestionPanel.handleParse
  → parseHl7Message(rawMessage)
  → useIngestionWorkflow.startReview(parsed)
      → load browser snapshot or create draft from built-in profile
      → executeMapping(parsed, draft)
      → buildReviewableFields(mappingResult, draft)
      → restore matching decisions

review action
  → update decision OR change draft source and rerun mapping
  → save safe browser snapshot

Hl7IngestionPanel.handleDownloadReport
  → composeCurrentNormalizedOutput(parsed, mappingResult)
  → buildReportPackage(...)
  → buildReportZip(...)
  → browser Blob download
```

## 1. The browser receives and holds the text

The `/` route renders [`App`](../apps/web/src/App.tsx), which mounts
[`Hl7IngestionPanel`](../apps/web/src/features/ingestion/hl7-ingestion-panel.tsx).
The panel starts with the bundled fixture imported as raw text. A person can
edit or paste that text, load the sample again, or select one `.hl7`/`.txt`
file. The file picker extension setting is a UI hint; the operative size check
is 1 MiB (1,048,576 UTF-8 bytes). The panel checks file size before reading,
checks decoded text again, and checks editor text before parsing. The parser
itself does not own that browser input limit. See
[input limits](../apps/web/src/features/ingestion/input-limits.ts) and
[input handling tests](../apps/web/src/features/ingestion/ingestion-input.test.tsx).

Editing, replacing, or reloading input clears the old parse and review. An
input revision counter discards a late file-read result if a newer edit or
selection happened first. A failed or oversized file leaves the prior editor
text available to fix or parse again. The raw message stays in React memory;
the app does not put it in `localStorage` or send it to the Worker.

## 2. Parsing finds structure and gates review

Clicking **Parse message** calls `parseHl7Message(rawMessage)` in the panel.
The parser normalizes CRLF/LF segment endings to carriage returns, reads
delimiters from the first `MSH` when present, and returns ordered segments,
fields, repetitions, components, subcomponents, message type/version, errors,
and warnings. `MSH` needs special field numbering: the separator is `MSH-1`,
the encoding characters are `MSH-2`. Source paths such as `PID-5.1` use
one-based HL7 positions; each parsed segment's `index` is zero-based.
See [parser details](hl7-ingestion.md) and
[parsed types](../packages/hl7-parser/src/types.ts).

For this demo, parser errors block review: the message must have a first and
single `MSH`, `MSH-9 = OML^O21^OML_O21`, `MSH-12 = 2.5.1`, a `PID`, and
`ORC`/`OBR` order content. An `OBR` before an `ORC` and an `ORC` group without
`OBR` also fail. Missing `SPM` warns but allows review. These are application
checks, not complete HL7 conformance validation. The parser does not require
exactly one PID. The panel displays issues and calls `startReview(parsed)` only
when `parsed.errors.length === 0`.

In the sample, `MSH` is parsed segment index 0 and `PID` is index 1. The
message has two `ORC` groups. The parser preserves all segments in order; the
mapping engine later decides how an order group becomes `labOrders[]`.

## 3. Starting review selects rules and executes them

[`useIngestionWorkflow.startReview`](../apps/web/src/features/ingestion/use-ingestion-workflow.ts)
loads the browser's saved snapshot. The pure
[`createReviewWorkflow`](../apps/web/src/features/ingestion/ingestion-workflow.ts)
looks for a compatible draft for the bundled profile. If none exists, it uses
[`createDemoDraftProfile`](../apps/web/src/features/ingestion/demo-storage.ts)
to copy the built-in published version 1 into an editable version 2 draft.
This does not publish anything or create a client on a server.

`executeMapping({ parsedMessage, profile })` validates that profile and runs
its 20 `hl7Item` instructions by ascending sequence. Each item declares a
target path, source coordinates, an action or named transform, and whether
missing output is an error. [`readSource`](../packages/mapping-engine/src/source-lookup.ts)
returns a value and explicit lookup status, with raw segment/field evidence in
memory. A rule may also use a prior rule's output. Each item contributes to a
partial `normalizedDraft` and an execution trace. Parser, mapping, and source
read issues become one validation summary. See
[mapping execution](mapping-execution.md) and [client profiles](client-profiles.md).

The parser does not decide that `PID-5.1` is a family name. The profile's
`patient-name` item declares that role; `mapXpnName` then creates a name object.
The first sample order is formed from the first `ORC` through the segment
before the next `ORC`; the second `ORC` begins the next order. Repeated `IN1`,
`ORC`, and `SPM` content is preserved in arrays. The built-in profile can
produce patient, sender, coverage, guarantor, and lab-order values, while
unknown local `Z` segments remain available in the parsed tree without an
automatic business meaning. See the [field matrix](supported-hl7-fields.md).

The sample makes the grouping visible: its first `ORC` starts order
`ORD-90017`, with `OBR-4.1` service `57021-8` and one `SPM` of type `BLD`
(whole blood). The next `ORC` starts order `ORD-90018`, with service `24323-8`
and one `SPM` of type `SER` (serum). These become `labOrders[0]` and
`labOrders[1]` in the [expected output](../fixtures/expected/oml-o21-basic.normalized.json),
each with its own `specimens[0]`.

## 4. Mapping evidence becomes a review workspace

`buildReviewableFields({ mappingResult, profile })` combines a mapped value
with its rule ID, target path, source paths, raw segment, named transform
history, source candidates, validation, and `unreviewed` status. It expands
array outputs into reviewable record leaves, and it turns validation and
unsuccessful source reads into cards in the warnings step. The five UI steps
are patient, sender, coverage/guarantor, lab orders, and warnings. See
[guided review](guided-review.md) and
[frontend architecture](frontend-architecture.md).

For the sample name, the chain is precise:

| Boundary       | What happens to `PID-5.1`                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw fixture    | `PID-5` contains `Lopez^Elena^M`; component 1 is `Lopez`.                                                                                     |
| Parser         | Segment index 1, field 5, first repetition, first component are preserved.                                                                    |
| Profile source | The `patient-name` rule assigns `PID-5.1` to the `family` role.                                                                               |
| Source read    | Status `found`, value `Lopez`, with raw field and segment evidence.                                                                           |
| Mapping        | `normalizedDraft.patient.name.family` becomes `Lopez`.                                                                                        |
| Review         | One `patient-name` field represents the whole name object; `PID-5.1` is its primary source.                                                   |
| Export         | `normalized-data.json` contains `patient.name.family`; `hl7-items.json` has the resolved rule; `review-decisions.json` has its review status. |

The review UI does not create a separate decision card for
`patient.name.family`: the `patient-name` object is the rule's review field.
The raw source and complete in-memory trace are useful while reviewing, but
they are not standalone files in the normal ZIP.

## 5. A correction changes the rule, then remaps the message

A reviewer can confirm a field, mark it incorrect, mark a missing value
unavailable with a structured reason, or choose an alternate source where the
field type supports one. The [source browser](../apps/web/src/features/ingestion/hl7-source-browser/hl7-source-browser.tsx)
enumerates parsed locations, lets the user search and preview them, and keeps
exact segment/repetition coordinates. Aggregate arrays and incompatible record
leaves cannot be replaced with one scalar source.

For a source change, the
[web workflow](../apps/web/src/features/ingestion/ingestion-workflow.ts)
checks that the field's evidence is still current and that the new read is
nonempty. The [mapping correction workflow](../packages/mapping-engine/src/guided-review/correction-workflow.ts)
updates the linked `hl7Item` in the draft, reruns `executeMapping`, and builds
fresh review fields. A name correction can replace one role, such as its
middle component, without erasing the other roles. A correction to one string
leaf of a repeated record creates a dependent item with structural record
identity so it will not silently modify a sibling record if output indexes
move. Ambiguous replay blocks with a validation error. See
[record correction details](guided-review.md#record-corrections-and-editor-lifetime).

After rerunning, the changed field has `mapping_changed` status and needs
confirmation. Decisions on unaffected fields survive only when their value,
source, validation, transforms, and dependent rules still match. This is why
correction changes the **recipe** as well as the screen value: another run of
the same message with that draft can explain and reproduce it.

## 6. Safe review metadata is saved locally

The [v3 browser snapshot](../apps/web/src/features/ingestion/demo-storage.ts)
saves the draft profile, structured review decisions, correction metadata,
and bounded demo events. It omits the raw HL7 message, extracted values, and
free-text review notes. An initial snapshot is saved at review start when
storage is usable; later decisions and corrections update it. Review remains
usable in memory when storage is unavailable, with a visible storage issue.
See [persistence details](client-profile-persistence.md).

After refresh, the user must supply and parse the same message again. A
fingerprint of normalized message text, profile identity/version, mapping
revision, and review-engine revision determine whether old decisions can be
restored. The fingerprint is a local equality key, not the export's SHA-256
hash. A changed review-engine revision can retain compatible correction
history while decisions are re-reviewed. A stale tab compares its expected
snapshot before writing; a detected conflict blocks further saves until the
user reloads the stored review. This comparison is best effort because
`localStorage` has no atomic transaction.

**Reset demo draft** attempts to replace the stored snapshot with an empty safe
snapshot and rebuilds review from the bundled published profile when a valid
message is still open. A storage failure is reported in the UI. Reset does not
require a Worker call. Review notes entered in the
current session can appear in its downloaded report; refreshing does not
restore those notes.

## 7. Completion and export use the current result

The UI uses [`assessReviewCompletion`](../packages/contracts/src/review-completion.ts)
to label the ZIP interim until review decisions and validation permit a
completed report. A confirmed business field resolves unless it has an error.
A missing value can be resolved as unavailable only with the appropriate
structured reason. `unreviewed`, `incorrect`, and `mapping_changed` remain
unresolved; warnings require acknowledgment; errors block completion. The
report generator independently checks completion from its own inputs and
rejects a requested completed report if those inputs do not support it. See
[report completion](../packages/report-generator/src/review-completion.ts).

[`handleDownloadReport`](../apps/web/src/features/ingestion/hl7-ingestion-panel.tsx)
clones the current raw message, parsed message, active draft, mapping result,
and review fields. It does **not** rerun the default profile at download time.
It computes SHA-256 of the raw text; the manifest records that hash, but the
hash cannot reconstruct the message. The web
[`composeCurrentNormalizedOutput`](../apps/web/src/features/ingestion/review-report.ts)
merges a complete default composer output with the partial profile draft.
Profile-mapped scalar values and whole arrays win; the merged business object
must pass `NormalizedOutputSchema`, even for interim export. This two-path
composition is a design tradeoff: the complete baseline and the profile's
mapping rules need to stay aligned when fields change.

The web app converts execution trace and current profile rules into report
`hl7Item`s with resolved paths/sources, and converts review fields into report
decisions. [`buildReportPackage`](../packages/report-generator/src/build-report-package.ts)
validates the input, creates payload files and their hashes, and validates a
manifest. [`buildReportZip`](../packages/report-generator/src/build-report-zip.ts)
compresses those files in memory using `fflate`. The panel creates a Blob URL
and triggers a browser download. An export revision counter discards a late
result after input or review changes. Parser errors block even interim export;
the normalized schema can also reject a structurally valid message at export.

The normal browser ZIP for the bundled client is:

```text
default-oml-o21.zip
└── default-oml-o21/
    ├── REPORT.md
    ├── manifest.json
    ├── normalized-data.json
    ├── hl7-items.json
    ├── review-decisions.json
    ├── validation-results.json
    └── mapping-summary.csv
```

The browser's policy excludes `source.hl7` from this ZIP. The report contains
normalized values, so it is intended only for synthetic data. To rerun the
mapping, another engineer needs the original message separately along with
the exported rule set; the SHA-256 hash can check a candidate message, not
recover the source. See [report file details](report-generation.md).

## Use this walkthrough to investigate a change

For any field, find its HL7 coordinate in the [field matrix](supported-hl7-fields.md),
the matching source in the [default profile](../packages/mapping-engine/src/profiles/default-oml-o21-profile.ts),
the [source read](../packages/mapping-engine/src/source-lookup.ts), its
transform or action in [mapping execution](mapping-execution.md), the review
field in [guided review](guided-review.md), and the final output in the
[expected fixture](../fixtures/expected/oml-o21-basic.normalized.json) or
ZIP. A new business field may also require a [contract schema](normalized-data-model.md)
and a [default composer](../packages/mapping-engine/src/default-composers.ts)
change. The [frontend guide](frontend-architecture.md) identifies the code
for input, source selection, storage, and download changes; the
[workspace guide](workspace-tooling.md) gives the commands and checks.

The current Worker is not part of this path. Its implemented route is
`GET /health`; D1 and server-side mapping/report processing remain planned.
See [Worker README](../apps/api/README.md) and
[product requirements](product-requirements.md).
