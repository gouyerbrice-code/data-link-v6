# Security

P0 establishes security-safe technical boundaries, not the full P1 identity/RLS model.

Principles:

- no hardcoded secrets;
- request/correlation identifiers are validated;
- unknown internal errors are not exposed through the API contract;
- structured logs redact common credential fields;
- request identifiers are propagated for technical traceability;
- no V5 authentication, tenant context, or database access is reused in P0.

[PROPOSITION V6] P1 must establish the complete tenant → user → role → permissions → base → mission → data chain and RLS as the second barrier.
