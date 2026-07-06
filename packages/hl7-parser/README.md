# HL7 Parser

Low-level HL7 v2 parser package for the HL7 Data Mapper workspace.

This package will be responsible for turning raw HL7 text into a predictable intermediate representation:

- message metadata
- ordered segments
- fields, repetitions, components, and subcomponents
- source locations used by review screens and reports

It should not know about patient output shapes, client-specific mapping rules, React state, or report ZIP generation. Keeping it narrow makes the parser reusable and easier to test.
