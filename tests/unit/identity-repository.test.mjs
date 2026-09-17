import test from "node:test";
import assert from "node:assert/strict";
import { IdentityRepository } from "../../src/identity/repository/identity-repository.mjs";

function makeSupabase(dataByTable) {
  return {
    from(table) {
      const state = { table, filters: [] };
      const builder = {
        select() { return builder; },
        eq(column, value) { state.filters.push([column, value]); return builder; },
        then(resolve, reject) {
          const rows = (dataByTable[state.table] ?? []).filter((row) =>
            state.filters.every(([column, value]) => row[column] === value),
          );
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

test("identity repository centralizes tenant-scoped reads", async () => {
  const supabase = makeSupabase({
    v6_tenant_memberships: [{ user_id: "u1", tenant_id: "t1" }],
    v6_bases: [{ tenant_id: "t1", id: "b1" }],
    v6_companies: [{ tenant_id: "t1", id: "c1" }],
    v6_groups: [{ tenant_id: "t1", id: "g1" }],
  });
  const repo = new IdentityRepository({ supabase: { client: supabase } });

  assert.deepEqual(await repo.getTenantMembershipsForUser("u1"), [{ user_id: "u1", tenant_id: "t1" }]);
  assert.deepEqual(await repo.getBasesForTenant("t1"), [{ tenant_id: "t1", id: "b1" }]);
  assert.deepEqual(await repo.getCompaniesForTenant("t1"), [{ tenant_id: "t1", id: "c1" }]);
  assert.deepEqual(await repo.getGroupsForTenant("t1"), [{ tenant_id: "t1", id: "g1" }]);
});
