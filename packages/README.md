# Packages

Shared workspace packages for the HL7 Data Mapper. The browser app imports all
four packages for its local parse, map, review, and report flow.

## Current packages

| Package                                          | Implemented responsibility                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| [`contracts`](contracts/README.md)               | Shared schemas, types, profile lifecycle, and review-completion helpers |
| [`hl7-parser`](hl7-parser/README.md)             | HL7 parsing and structural validation                                   |
| [`mapping-engine`](mapping-engine/README.md)     | Profile execution, default composers, and guided-review helpers         |
| [`report-generator`](report-generator/README.md) | Report files, manifest, and ZIP creation in memory                      |

See [project structure](../docs/project-structure.md) for the dependency
direction and package boundaries.
