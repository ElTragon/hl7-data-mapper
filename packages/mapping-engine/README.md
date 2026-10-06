# Mapping Engine

`@hl7-data-mapper/mapping-engine` maps parsed HL7 data into the shared
normalized contracts. It exports the built-in OML^O21 profile,
`executeMapping()`, default normalized composers, source lookup helpers, and
guided-review helpers.

`executeMapping()` validates a draft or published profile, runs its `hl7Item`s
in sequence, and returns a normalized draft, review-ready fields, validation
issues, and an execution trace. The trace keeps the source path, resolved value,
lookup status, segment index, raw segment, and raw field in memory so a
reviewer can inspect where a value came from. Archived profiles cannot run.

The executor supports extraction, validation, defaults, date and timestamp
normalization, joining values, and the default profile's named transforms for
identifiers, names, addresses, telecom, coverage, guarantor, and lab-order
objects. A different, unknown named transform is reported as pending. The
default composers can build a complete normalized object from a parsed message;
the web report flow combines that object with the current profile's mapped
values.

Guided-review helpers create fields, section progress, warning cards, and
source-selection corrections. Applying a source correction changes the linked
`hl7Item` on an editable draft profile, reruns mapping, and rebuilds the review
fields. The package does not parse raw HL7 text or render the UI.

The current named address, telecom, coverage, and order transforms each produce
at most one entry from their configured source reads. See
[mapping execution](../../docs/mapping-execution.md) for this limit and the
supported actions, and [guided review](../../docs/guided-review.md) for the
review workflow.
