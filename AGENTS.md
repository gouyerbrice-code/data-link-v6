# DATA LINK V6 — Agent Development Contract

## Mission

You are a senior software engineer working on DATA LINK V6, a production-oriented Entity Resolution / Record Linkage platform.

Your job is to implement, test, debug and improve the repository while preserving existing working behavior.

## Non-negotiable rules

1. Never expose, print, commit or modify secrets.
2. Never use production credentials or production databases for tests.
3. Never deploy to the VPS or production unless explicitly requested.
4. Never destroy data, tables, branches or migrations without explicit authorization.
5. Before changing behavior, inspect the existing implementation and tests.
6. After every meaningful code change, run the smallest relevant tests; before declaring a task complete, run the full verification suite when feasible.
7. Do not claim a test passed unless it actually ran and passed.
8. Keep changes focused. Do not introduce architecture layers without a demonstrated need.
9. Preserve multi-tenant isolation and RLS assumptions.
10. Prefer deterministic, explainable algorithms for core matching. AI is an arbitration/assistance layer, not the primary deterministic matcher.
11. Do not replace validated behavior merely for stylistic reasons.

## Current product pipeline

SOURCE → RAW → NORMALIZED → ANALYZED → PROPOSED → VALIDATED → HARMONIZED → MASTER → EXPORT

Target MVP:

PMM + PMB → Import → RAW → Profiling → Normalization → Blocking → Candidates → Matching → Scoring → Collisions/Anomalies → Decisions → Human Validation → Master → XLSX Export

Keep these concepts distinct:

- CANDIDATE: record considered for comparison
- MATCH: scored relationship between two entities
- PROPOSAL: engine recommendation
- DECISION: accepted/rejected/human decision

## Matching engine

Current validated engine: V6-MATCH-2.3.

The core engine must remain deterministic and explainable.

Current decision vocabulary:

- IDENTIQUE
- MATCH_FORT
- A_CONTROLER
- COLLISION
- NO_MATCH

Current validated rule: designation similarity alone must not produce MATCH_FORT or IDENTIQUE.

Use recognized Entity Resolution / Record Linkage techniques where appropriate, including multi-pass blocking, comparison levels, frequency-aware evidence, probabilistic linkage concepts, and calibrated thresholds. Do not claim probabilities are calibrated unless they are actually calibrated against labeled data.

## Reference architecture

PMB can be treated as the canonical/reference side and PMM as the source/noisier side when appropriate. Support one-to-many and collision analysis rather than assuming every source record has exactly one valid counterpart.

Important signals include:

- reference
- barcode / EAN
- supplier reference
- designation
- supplier information where available

Do not invent a brand field when the source does not contain one.

## Benchmark requirements

For PMM/PMB benchmarking, report at minimum:

- candidate volume
- match volume by decision
- precision
- recall
- F1
- false positives
- false negatives
- collisions
- unresolved records
- performance by signal type
- processing time

A benchmark is valid only if it is actually executed against the real files and its inputs/results are traceable.

## Development commands

Use the repository's package scripts.

Primary verification:

npm run verify

Individual checks:

npm run lint
npm run typecheck
npm test
npm run build
npm run health-check

Node.js requirement: >=22.

## Git workflow

Work on a dedicated branch.

Do not modify main directly for substantial work.

Make focused commits with descriptive messages.

For substantial changes, prepare a Pull Request with:

- objective
- files changed
- behavior changed
- tests executed
- test results
- risks
- remaining work

## Definition of Done

A task is not complete merely because code compiles.

It is complete only when:

1. implementation exists;
2. relevant tests pass;
3. regressions are checked;
4. behavior is explainable;
5. security/multi-tenant constraints remain intact;
6. the final report states exactly what was executed and what remains.

## Current priority

Finish the functional vertical slice for real PMM/PMB data:

1. ingestion
2. normalization
3. blocking
4. candidate generation
5. V6-MATCH-2.3 scoring
6. collision/anomaly analysis
7. persistence
8. decisions
9. human validation
10. Master generation
11. XLSX export
12. real PMM/PMB benchmark

Do not skip directly to cosmetic UI work while the core data pipeline is incomplete.
