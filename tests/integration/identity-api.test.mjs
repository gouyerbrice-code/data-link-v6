import test from "node:test";
import assert from "node:assert/strict";
import { createRouter } from "../../src/api/router.mjs";
import { loadConfig } from "../../src/core/configuration.mjs";
import { createLogger } from "../../src/core/logger.mjs";
import { IdentityService } from "../../src/identity/service/identity-service.mjs";

const tenantA = "11111111-1111-4111-8111-111111111111";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const repository = {
  async getTenantsForUser() {
    return [{ status: "ACTIVE", tenant: { id: tenantA, name: "Tenant A", slug: "tenant-a", status: "ACTIVE" }, role: { code: "ADMIN" } }];
  },
  async getBasesForTenant(tenantId) { return [{ tenant_id: tenantId, id: "44444444-4444-4444-8444-444444444444" }]; },
  async getCompaniesForTenant(tenantId) { return [{ tenant_id: tenantId, id: "55555555-5555-4555-8555-555555555555" }]; },
  async getGroupsForTenant(tenantId) { return [{ tenant_id: tenantId, id: "66666666-6666-4666-8666-666666666666" }]; },
};

const config = loadConfig({ NODE_ENV: "test", APP_NAME: "data-link-v6-test" });
const logger = createLogger({ level: "error", environment: "test", sink: { log() {}, warn() {}, error() {} } });
const service = new IdentityService({ repository });
const router = createRouter({
  config,
  logger,
  identityService: service,
  resolveAuthenticatedUser: async () => userA,
});

test("GET /auth/context resolves server-authenticated user context", async () => {
  const response = await router.handle(new Request("http://localhost/auth/context", {
    headers: { "x-tenant-id": tenantA },
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user_id, userA);
  assert.equal(body.tenant_id, tenantA);
});

test("identity endpoints require tenant context where needed", async () => {
  const response = await router.handle(new Request("http://localhost/bases"));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "VALIDATION_ERROR");
});

test("identity API does not trust a client-supplied user id", async () => {
  const response = await router.handle(new Request("http://localhost/tenants", {
    headers: { "x-user-id": "attacker" },
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body[0].tenant.id, tenantA);
});

test("identity API is unavailable rather than unauthenticated when auth adapter is absent", async () => {
  const unauthenticatedRouter = createRouter({ config, logger });
  const response = await unauthenticatedRouter.handle(new Request("http://localhost/tenants"));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, "AUTHENTICATION_ERROR");
});
