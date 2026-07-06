# Synthetic HL7 Fixtures

Every fixture in this directory is fictional and intended only for local
development, automated tests, and portfolio demonstrations.

Do not place exported production messages or real patient data here.

## Layout

```text
valid/             Messages accepted by the MVP application profile
invalid/           Messages that demonstrate a specific profile error
client-variants/   Structurally supported client-specific conventions
expected/          Canonical normalized output for valid fixtures
private/           Git-ignored local experiments; never commit PHI
```

## Fixture identities

Names, identifiers, organizations, addresses, telephone numbers, orders, and
policy values are invented. They do not represent real people or customers.
