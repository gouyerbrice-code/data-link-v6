# DATA LINK V6 — P1 Identity Foundation

## Status

P1 source construction is complete, but **database application is blocked** until a real development PostgreSQL/Supabase target is provisioned.

## [OBSERVÉ V5]

V5 contains tenants, memberships, bases, companies, groups and roles.

## [PROPOSITION V6]

V6 identity tables are isolated under the `v6_` namespace:

- `v6_tenants`
- `v6_tenant_memberships`
- `v6_roles`
- `v6_permissions`
- `v6_role_permissions`
- `v6_bases`
- `v6_companies`
- `v6_groups`
- `v6_group_companies`

UUID primary keys are used.

The role concepts OWNER, ADMIN, REVIEWER and USER are seeded because they are observed V5 concepts. The complete permission matrix is deliberately deferred to P2.

## P1 / P2 boundary

P1 provides the identity data model and service/repository boundaries.

P2 must add:

- authenticated user resolution against Supabase Auth;
- complete Security Context;
- authorization matrix;
- RLS;
- server-side enforcement;
- tenant/base/resource isolation tests.

P1 does not claim complete security.

## Database verification

The repository currently has no provisioned development PostgreSQL/Supabase target in the construction environment. Therefore the migration has been structurally tested but **not applied to a real database**.

This is an explicit [À VÉRIFIER] / environment blocker, not a simulated success.
