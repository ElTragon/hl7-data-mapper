# Frontend architecture

This is the code reference for the current browser app. Read
[message to report](message-to-report.md) for the complete user journey, then
use this page when changing React behavior, review state, source selection,
browser storage, or download wiring. The product currently runs one synthetic
HL7 v2.5.1 OML/O21 review locally. The Worker is separate; this frontend does
not call it. The reasons below describe what the code and product requirements
support, rather than undocumented decisions by the original authors.

## What the frontend owns

The web app owns user input, screen state, the choice to continue after parsing,
the editable draft review session, browser persistence, and the final download.
It imports business logic from all four workspace packages:

```text
React input ──> hl7-parser ──> mapping-engine ──> review UI
                         contracts ↑       │
                                   └────────┘
                    current review + output ──> report-generator ──> ZIP download
```

The [parser](../packages/hl7-parser/src/index.ts) owns HL7 splitting and
structural checks; the [mapping engine](../packages/mapping-engine/src/index.ts)
owns rule execution and source evidence; [contracts](../packages/contracts/src/index.ts)
owns shared validated shapes; the [report generator](../packages/report-generator/src/index.ts)
owns report files and ZIP bytes. React components do not implement those
algorithms. The frontend does contain orchestration and the final merge of the
default composer output with the profile-directed mapping draft.

## Entry points and component map

[`main.tsx`](../apps/web/src/main.tsx) mounts React `StrictMode`,
[`AppProviders`](../apps/web/src/providers/app-providers.tsx), and the
[`RouterProvider`](../apps/web/src/router.tsx). TanStack Router has a root
outlet and one implemented `/` route; that route renders
[`App`](../apps/web/src/App.tsx). `App` renders the introduction, workflow
marketing sections, and [`Hl7IngestionPanel`](../apps/web/src/features/ingestion/hl7-ingestion-panel.tsx).
The page's “Publish the mapping” marketing step describes a planned workflow;
there is no publishing control in the current UI.

The QueryClient provider is configured, but the current message path contains
no `fetch`, query, or mutation call. Vite uses the React, TanStack Router, and
Tailwind plugins, and the `@/` alias points at `src`. The reusable controls in
[`components/ui`](../apps/web/src/components/ui) follow the checked-in
[shadcn configuration](../apps/web/components.json); app-wide state variants
and styling are in [`index.css`](../apps/web/src/index.css). These pieces
provide an organized UI shell without making a server request part of the
demo's data flow. See [Vite configuration](../apps/web/vite.config.ts).

| Frontend area                        | Main file                                                                                                     | Responsibility                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Message intake, parse result, export | [`hl7-ingestion-panel.tsx`](../apps/web/src/features/ingestion/hl7-ingestion-panel.tsx)                       | Holds editor/upload state, calls parser, starts review, packages and downloads the report.         |
| Review session state                 | [`use-ingestion-workflow.ts`](../apps/web/src/features/ingestion/use-ingestion-workflow.ts)                   | Bridges pure workflow transitions to React and browser storage.                                    |
| Review transitions                   | [`ingestion-workflow.ts`](../apps/web/src/features/ingestion/ingestion-workflow.ts)                           | Creates a session, applies decisions/corrections, reruns mapping, and restores eligible decisions. |
| Review screen                        | [`guided-review-workspace.tsx`](../apps/web/src/features/ingestion/guided-review/guided-review-workspace.tsx) | Composes the step rail, field list, inspector, progress, and controls.                             |
| Source chooser                       | [`hl7-source-browser.tsx`](../apps/web/src/features/ingestion/hl7-source-browser/hl7-source-browser.tsx)      | Searches and previews source coordinates, then submits a supported selection.                      |
| Safe local draft                     | [`demo-storage.ts`](../apps/web/src/features/ingestion/demo-storage.ts)                                       | Loads/migrates/validates snapshots and detects stale saves.                                        |
| Report handoff                       | [`review-report.ts`](../apps/web/src/features/ingestion/review-report.ts)                                     | Builds current normalized output and report-facing rules/decisions.                                |

The boundary between the pure workflow module and the React hook matters. A
mapping rerun and decision merge can be tested as data transformations without
rendering a component. The hook supplies clock and storage dependencies and
keeps the latest state in a ref so closely spaced UI actions do not work from an
older render. The UI components then render `ReviewableField`s and dispatch
events. See [workflow tests](../apps/web/src/features/ingestion/ingestion-workflow.test.ts)
and [hook tests](../apps/web/src/features/ingestion/use-ingestion-workflow.test.ts).

## Input and parse lifecycle

The panel begins with the bundled
[synthetic fixture](../fixtures/valid/oml-o21-basic.hl7), imported by Vite as
raw text with `?raw`. The user can edit it, paste another message, choose one
`.hl7`/`.txt` file, or reload the sample. The file accept list helps the picker;
the implemented size rule is a maximum of 1,048,576 UTF-8 bytes, measured in
[`input-limits.ts`](../apps/web/src/features/ingestion/input-limits.ts).
The panel checks the file size before reading, checks the decoded text again,
and checks edited text before parsing. An oversized edit remains visible for
correction. A failed or oversized replacement upload leaves the prior editor
text available.

Any input change invalidates the previous parse and review. File reading is
asynchronous, so an `inputRevision` ref identifies the latest request: a late
completion or failure from an older file cannot replace newer input. Parsing is
disabled during a read. `handleParse` calls
[`parseHl7Message`](../packages/hl7-parser/src/parse-hl7-message.ts)
locally. The panel displays message type, version, segment/order/specimen
counts, and parser issues. Any parser error clears and blocks guided review;
warnings remain visible and review can continue. The parser returns issues;
the panel makes this product-level gate decision. See
[input lifecycle tests](../apps/web/src/features/ingestion/ingestion-input.test.tsx).

## Starting a review session

After a valid parse, `startReview` in the [hook](../apps/web/src/features/ingestion/use-ingestion-workflow.ts)
loads the browser snapshot and calls `createReviewWorkflow`. The pure
[workflow module](../apps/web/src/features/ingestion/ingestion-workflow.ts)
chooses a compatible saved draft or makes an editable draft of the published
[built-in profile](../packages/mapping-engine/src/profiles/default-oml-o21-profile.ts).
It executes mapping, builds reviewable fields, computes a fingerprint of the
parser's normalized message text, restores eligible prior decisions, and
selects the first patient field. The initial review state contains:

```ts
type ReviewWorkflowState = {
  parsedMessage: ParsedHl7Message
  profile: ClientProfile // editable browser draft
  mappingResult: MappingExecutionResult
  reviewFields: readonly ReviewableField[]
  messageFingerprint: string
  activeStepId: GuidedReviewStepId
  selectedFieldId: string | null
}
```

`mappingResult` is the current rule output and evidence, not a completed
business JSON object. The report handoff adds the complete baseline and
validates the merged output. The browser stores a draft profile; it does not
change the published built-in profile or offer client/profile selection.

## Guided review and source correction

The review workspace shows patient, sender, coverage and guarantor, lab orders,
then warnings. Its [step rail](../apps/web/src/features/ingestion/guided-review/review-step-rail.tsx)
shows progress. The [field list](../apps/web/src/features/ingestion/guided-review/review-field-list.tsx)
shows the value, target path, source, rule ID, and decision controls.
The [inspector](../apps/web/src/features/ingestion/guided-review/review-field-inspector.tsx)
shows the selected value, raw segment, source-read status and expectations,
named transform history when available, and the source browser. Composite
values are rendered as readable rows by
[`CollectedValue`](../apps/web/src/features/ingestion/guided-review/collected-value.tsx).
The review screen derives step counts and selection behavior from
[`review-workspace-model.ts`](../apps/web/src/features/ingestion/guided-review/review-workspace-model.ts).

A reviewer can confirm a field, mark it incorrect, or mark it unavailable when
no meaningful value was collected. Reason codes and optional review notes are
edited in the field list. An unsaved decision editor closes when the mapping
result, selected field, or step changes, so a stale editor cannot be submitted
against a different field. A completed decision depends on the shared
[completion rules](../packages/contracts/src/review-completion.ts); mapping
errors and unresolved warnings keep export interim. See the deeper
[guided review reference](guided-review.md).

The source browser builds candidate options from parsed fields,
repetitions, components, and subcomponents. Each option carries an exact parsed
`segmentIndex`, path, source context, value preview, and order-group context
where relevant. [`source-options.ts`](../apps/web/src/features/ingestion/hl7-source-browser/source-options.ts)
creates them using the mapping engine's `readSourceValue`;
[`source-search.ts`](../apps/web/src/features/ingestion/hl7-source-browser/source-search.ts)
filters and groups them; [`source-builder-model.ts`](../apps/web/src/features/ingestion/hl7-source-browser/source-builder-model.ts)
supports the guided path builder. Display labels in
[`source-display-metadata.ts`](../apps/web/src/features/ingestion/hl7-source-browser/source-display-metadata.ts)
are UI metadata, not mapping rules. Empty and incompatible composite candidates
are blocked by [`source-selection-rules.ts`](../apps/web/src/features/ingestion/hl7-source-browser/source-selection-rules.ts)
and workflow checks. Aggregate arrays cannot be replaced by one scalar source;
record corrections target supported string leaves. A person name can choose
the family/given/middle/suffix/prefix role independently.

Applying a source is a data change, not a display override. The workflow
checks that the selected field still has the same value, source, validation,
transform, and dependent mapping evidence. It checks that the candidate has a
nonempty found read, removes raw segment text from the replacement rule, then
asks the mapping engine to update the draft and rerun mapping. It rebuilds
review fields, marks the changed field `mapping_changed`, and keeps other
decisions only when their evidence is unchanged. The corrected field needs
confirmation again. See [field evidence](../apps/web/src/features/ingestion/review-evidence.ts),
[workflow correction](../apps/web/src/features/ingestion/ingestion-workflow.ts),
and [mapping correction logic](../packages/mapping-engine/src/guided-review/profile-corrections.ts).

## Browser snapshot and reload

The panel keeps raw text, parsed values, and execution trace in React memory.
The browser's v3 `localStorage` snapshot keeps one draft profile, structured
decisions, correction metadata, and up to 250 safe demo audit events. It strips
`SourceReference.raw`; it does not save the message text, extracted values,
or free-text review notes. The saved snapshot is validated by the
[contracts schema](../packages/contracts/src/persistence.ts).
See [browser storage](../apps/web/src/features/ingestion/demo-storage.ts).

After refresh, the user provides and parses the same message again. Decision
restoration requires matching message fingerprint, client/profile identity,
profile version, mapping revision, and review engine revision; saved paths and
unavailable status are checked again against current fields. Compatible applied
correction history can survive a review engine revision even when decisions
reset. The message fingerprint is a fast equality key over normalized text,
separate from the SHA-256 hash used in the report. See
[`review-evidence.ts`](../apps/web/src/features/ingestion/review-evidence.ts),
[`message-fingerprint.ts`](../apps/web/src/features/ingestion/message-fingerprint.ts),
and [decision restore](../apps/web/src/features/ingestion/ingestion-workflow.ts).

The hook carries the snapshot it loaded as its expected base for writes.
`demo-storage.ts` compares that base with current storage before saving, so a
stale tab normally detects a conflict and asks the reviewer to reload. This is
best-effort: `localStorage` does not provide an atomic compare-and-set operation.
An invalid snapshot is preserved until explicit reset; an unavailable storage
read never becomes an empty snapshot. In-memory review remains available when
storage cannot be accessed. [Session transitions](../apps/web/src/features/ingestion/review-persistence-session.ts)
make conflict, invalid data, cleanup failure, and unavailable storage visible
to the panel. Reset clears the stored draft, decisions, and correction history
and starts a fresh draft against the current valid parsed message.

## Export and download boundary

The panel computes its visible interim/completed label from
`assessReviewCompletion`. On download it clones the current editor text,
parsed message, active profile, mapping result, and review fields into a single
snapshot. [`review-report.ts`](../apps/web/src/features/ingestion/review-report.ts)
constructs report-facing rules from execution trace paths/sources, converts
fields into review decisions, composes complete normalized output from the
default composer plus current mapping draft, and validates it with
`NormalizedOutputSchema`. Mapped values override corresponding baseline
values; arrays are replaced as whole values. Even an interim report requires
valid normalized output.

The panel hashes the raw editor text and payload contents with browser
`crypto.subtle` SHA-256, calls
[`buildReportPackage`](../packages/report-generator/src/build-report-package.ts)
and [`buildReportZip`](../packages/report-generator/src/build-report-zip.ts),
then downloads the ZIP through a temporary Blob URL. The default web policy
excludes raw HL7; normalized synthetic values are included. The report
generator rechecks completion and rejects a requested completed package when
its inputs do not support it. `exportAttempt` invalidates a pending async
export when input or review data changes, so old results cannot download or update
the current status. See [report generation](report-generation.md) and
[export tests](../apps/web/src/features/ingestion/review-report.test.ts).

## Working in this code

| Change                                         | Start with                                                                                                                                                                                                                | Verify with                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload, editor, byte limit, or stale file read | [panel](../apps/web/src/features/ingestion/hl7-ingestion-panel.tsx), [input limits](../apps/web/src/features/ingestion/input-limits.ts)                                                                                   | [input tests](../apps/web/src/features/ingestion/ingestion-input.test.tsx)                                                                                       |
| Review state or source correction semantics    | [pure workflow](../apps/web/src/features/ingestion/ingestion-workflow.ts), [field evidence](../apps/web/src/features/ingestion/review-evidence.ts), [hook](../apps/web/src/features/ingestion/use-ingestion-workflow.ts)  | [workflow tests](../apps/web/src/features/ingestion/ingestion-workflow.test.ts), [hook tests](../apps/web/src/features/ingestion/use-ingestion-workflow.test.ts) |
| Step rail, field decisions, inspector          | [guided review components](../apps/web/src/features/ingestion/guided-review)                                                                                                                                              | [app interactions](../apps/web/src/App.test.tsx), [browser journeys](../apps/web/tests/e2e/review-workflow.spec.ts)                                              |
| Candidate search, preview, path building       | [source browser models](../apps/web/src/features/ingestion/hl7-source-browser)                                                                                                                                            | [source browser tests](../apps/web/src/features/ingestion/hl7-source-browser/hl7-source-browser.test.tsx)                                                        |
| Snapshot shape, migration, or conflicts        | [persistence contracts](../packages/contracts/src/persistence.ts), [storage](../apps/web/src/features/ingestion/demo-storage.ts), [session transitions](../apps/web/src/features/ingestion/review-persistence-session.ts) | [storage tests](../apps/web/src/features/ingestion/demo-storage.test.ts), [competing-tab browser test](../apps/web/tests/e2e/review-workflow.spec.ts)            |
| Normalized export or ZIP handoff               | [web report bridge](../apps/web/src/features/ingestion/review-report.ts), [panel export](../apps/web/src/features/ingestion/hl7-ingestion-panel.tsx)                                                                      | [report tests](../apps/web/src/features/ingestion/review-report.test.ts), [browser ZIP test](../apps/web/tests/e2e/review-workflow.spec.ts)                      |

Web unit and integration tests run with Vitest and jsdom; the
[Vitest config](../apps/web/vitest.config.ts) gates coverage on product-owned
logic. [Playwright](../apps/web/playwright.config.ts) checks the built browser
journey, including upload, corrections, refresh, storage conflicts, report
downloads, and phone-width controls. The root [README](../README.md) lists
commands and their prerequisite builds.

## Current limits

The UI has one route and one bundled profile. Client creation, selection,
publishing, server ingestion, D1-backed storage, and API-based report generation
are not implemented. The Query provider and some installed form libraries are
present but do not take part in the current data flow. The project is a synthetic-data demo;
browser storage safety checks and the local ZIP policy do not authorize real
patient data or establish HIPAA compliance.
