# Contracts

Shared TypeScript contracts for the HL7 Data Mapper workspace.

This package will own the validated shapes that the rest of the app agrees on:

- normalized extraction output
- `hl7Item` mapping steps
- client mapping profile metadata
- report manifest data

It should stay free of UI, file-upload, and parser implementation details. That keeps the normalized data model stable even as the React app, parser, and mapping engine evolve independently.
