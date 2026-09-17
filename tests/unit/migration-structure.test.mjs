import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile("supabase/migrations/001_v6_identity_foundation.sql", "utf8");

for (const table of [
  "v6_roles",
  "v6_permissions",
  "v6_role_permissions",
  "v6_tenants",
  "v6_tenant_memberships",
  "v6_bases",
  "v6_companies",
  "v6_groups",
  "v6_group_companies",
]) {
  test(`migration declares ${table}`, () => {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`, "i"));
  });
}

test("migration uses UUID primary keys", () => {
  const declarations = (sql.match(/id uuid primary key/g) ?? []).length;
  assert.ok(declarations >= 7);
});

test("membership uniqueness is tenant + user", () => {
  assert.match(sql, /unique \(tenant_id, user_id\)/i);
});

test("P1 migration does not create P2 RLS policies", () => {
  assert.doesNotMatch(sql, /\bcreate policy\b/i);
  assert.doesNotMatch(sql, /\benable row level security\b/i);
});

test("P1 migration contains no V5 table names", () => {
  assert.doesNotMatch(sql, /\bv5_/i);
});
