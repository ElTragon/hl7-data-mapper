# Start here: HL7 Data Mapper documentation

HL7 Data Mapper is a browser workspace for understanding a **synthetic** HL7 v2
laboratory-order message. It parses the message, applies an explicit mapping
profile, lets a reviewer confirm or correct the extracted fields, and downloads
a report ZIP. The [repository README](../README.md) covers setup and commands;
this page shows where to learn how the code works.

If HL7 is new to you, think of a message as a series of named text records.
For example, `PID` holds patient information and `OBR` holds order detail. A
source such as `PID-5.1` means the first component of the fifth `PID` field.
The [sample message](../fixtures/valid/oml-o21-basic.hl7) and its
[expected JSON](../fixtures/expected/oml-o21-basic.normalized.json) show how
those coordinates become ordinary business data.

```text
synthetic HL7 text → parser → mapping rules → review and corrections
                                              ↓
                                       normalized data → report ZIP
```

The current app runs this flow locally in the browser for one supported profile:
HL7 v2.5.1 `OML^O21^OML_O21` laboratory orders. The Cloudflare Worker only
serves `/health`. Client creation, profile selection and publishing, D1-backed
storage, and server-side processing are planned. The demo is for synthetic data
only; its downloaded ZIP contains normalized message values.

## Choose a reading path

| Your goal                   | Read in this order                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explain the code end to end | This page → [message-to-report workflow](message-to-report.md) → the subsystem references it links to                                                |
| Change one behavior         | [Message-to-report workflow](message-to-report.md) → the relevant subsystem reference below → its linked source and tests                            |
| Evaluate the design         | [Project structure](project-structure.md) → [workflow](message-to-report.md) → relevant references → [product requirements](product-requirements.md) |
| Run or test the workspace   | [Repository README](../README.md) → [workspace and tooling](workspace-tooling.md)                                                                    |

## Find the owner of a question

| Question                                                             | Detailed reference                                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| What runs when I parse, correct, refresh, or export?                 | [Message-to-report workflow](message-to-report.md)                                                               |
| Why pnpm, how do the packages build, and what does CI run?           | [Workspace and tooling](workspace-tooling.md)                                                                    |
| How does the browser route, state, source picker, and download work? | [Frontend architecture](frontend-architecture.md)                                                                |
| How is raw HL7 split, and which messages are blocked?                | [HL7 ingestion and parser](hl7-ingestion.md)                                                                     |
| What fields can the built-in profile read?                           | [Supported HL7 field matrix](supported-hl7-fields.md)                                                            |
| How do source lookup, transforms, arrays, and execution traces work? | [Mapping execution](mapping-execution.md)                                                                        |
| What do normalized values and source evidence look like?             | [Normalized data model](normalized-data-model.md)                                                                |
| What is an `hl7Item`, and how are profile versions managed?          | [Client profiles](client-profiles.md)                                                                            |
| How do field decisions and source corrections work?                  | [Guided review](guided-review.md)                                                                                |
| What is stored in the browser, and what is planned for D1?           | [Profile persistence](client-profile-persistence.md)                                                             |
| What is in the ZIP, and when can it say “completed”?                 | [Report generation](report-generation.md)                                                                        |
| What is still a product goal or an open validation decision?         | [Product requirements](product-requirements.md) and [ingestion validation backlog](ingestion-validation-todo.md) |

The [project structure](project-structure.md) is the compact package map.
`apps/web` connects the parser, mapping engine, shared contracts, and report
generator. `apps/api` is a separate Worker scaffold. Each detailed reference
owns its subsystem's rules and limits; the workflow document connects them
using one concrete message. Planned behavior is labeled as such so it cannot
be mistaken for a working feature.

**A useful first exercise:** find `Lopez` in the sample `PID-5` field, follow
`PID-5.1` through the [workflow](message-to-report.md), and find it again in
`patient.name.family` in the expected JSON. Then ask which rule made that
choice and where a reviewer would change it.
