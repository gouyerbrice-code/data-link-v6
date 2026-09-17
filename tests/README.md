# Tests

P0 uses Node.js built-in test runner.

Current coverage is intentionally technical:

- core configuration
- error contract
- logger redaction
- request/correlation ID
- API health/readiness
- P0 security boundaries

P1 adds identity service, repository contract, API context, and migration-structure tests. Real PostgreSQL execution remains blocked until a development target is provisioned.
