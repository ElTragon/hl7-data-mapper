# Packages

Shared workspace packages for the HL7 Data Mapper.

Think of these packages like different stations in an assembly line:

1. `contracts` defines what the finished data should look like.
2. `hl7-parser` breaks raw HL7 text into smaller pieces.
3. `mapping-engine` decides which pieces become patient, sender, coverage, guarantor, and lab-order data.

Keeping these jobs separate makes the project easier to test, explain, and scale.

## Current packages

| Package                           | Job                                    |
| --------------------------------- | -------------------------------------- |
| `@hl7-data-mapper/contracts`      | Shared schemas and TypeScript types    |
| `@hl7-data-mapper/hl7-parser`     | Raw HL7 parsing                        |
| `@hl7-data-mapper/mapping-engine` | Client-specific extraction and mapping |

## Rule of thumb

If a package starts doing too many jobs, split the work instead of making that package smarter and messier.
