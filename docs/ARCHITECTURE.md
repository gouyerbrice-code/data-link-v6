# DATA LINK V6 — Architecture P0

## Position

DATA LINK V6 is a modular monolith. P0 establishes technical foundations only.

Target boundary:

`FRONTEND → API → SECURITY CONTEXT → ORCHESTRATOR → RUN → CAPABILITY → ENGINE → PERSISTENCE / ADAPTERS`

P0 implements only:

`API → CORE → RUNTIME`

No business capability is implemented.

## Product boundary

**DATA LINK ≠ ERP.**

DATA LINK remains an intelligent data understanding, normalization, matching, control, harmonization and restitution layer between source and target systems.

The following distinctions are structural:

- CANDIDATE ≠ MATCH
- MATCH ≠ PROPOSITION
- PROPOSITION ≠ DECISION
- DECISION ≠ HARMONIZATION
- HARMONIZATION ≠ MASTER
- MASTER ≠ EXPORT

## Isolation

V5 is a separate repository/reference. P0 contains no V5 source, SQL migration, runtime import, or dependency.

[OBSERVÉ V5] V5 exists as the functional reference.

[PROPOSITION V6] V6 uses independent repository/runtime boundaries and introduces compatibility only in P14.
