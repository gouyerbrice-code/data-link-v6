import test from "node:test";
import assert from "node:assert/strict";
import { IdentityService } from "../../src/identity/service/identity-service.mjs";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const roleAdmin = "33333333-3333-4333-8333-333333333333";

const repository = {
  async getTenantsForUser(userId) {
    if (userId === userA) return [
      { status: "ACTIVE", tenant: { id: tenantA, name: "Tenant A", slug: "tenant-a", status: "ACTIVE" }, role: { id: roleAdmin, code: "ADMIN", name: "Administrator" } },
    ];
    return [
      { status: "ACTIVE", tenant: { id: tenantB, name: "Tenant B", slug: "tenant-b", status: "ACTIVE" }, role: { id: roleAdmin, code: "ADMIN", name: "Administrator" } },
    ];
  },
  async getBasesForTenant(tenantId) { return [{ tenant_id: tenantId, id: "44444444-4444-4444-8444-444444444444" }]; },
  async getCompaniesForTenant(tenantId) { return [{ tenant_id: tenantId, id: "55555555-5555-4555-8555-555555555555" }]; },
  async getGroupsForTenant(tenantId) { return [{ tenant_id: tenantId, id: "66666666-6666-4666-8666-666666666666" }]; },
};

test("user can resolve an active tenant context", async () => {
  const service = new IdentityService({ repository });
  const context = await service.getContext({ userId: userA, tenantId: tenantA });
  assert.equal(context.user_id, userA);
  assert.equal(context.tenant_id, tenantA);
  assert.equal(context.membership.role.code, "ADMIN");
});

test("user without requested tenant is rejected", async () => {
  const service = new IdentityService({ repository });
  await assert.rejects(
    service.getContext({ userId: userA, tenantId: tenantB }),
    (error) => error.code === "TENANT_ACCESS_ERROR" && error.status === 403,
  );
});

test("base/company/group access is tenant-scoped at service boundary", async () => {
  const service = new IdentityService({ repository });
  assert.equal((await service.getBases(userA, tenantA))[0].tenant_id, tenantA);
  assert.equal((await service.getCompanies(userA, tenantA))[0].tenant_id, tenantA);
  assert.equal((await service.getGroups(userA, tenantA))[0].tenant_id, tenantA);
});
