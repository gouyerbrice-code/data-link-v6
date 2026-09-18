import test from "node:test";
import assert from "node:assert/strict";

import { createHttpServer } from "../../src/api/server.mjs";
import { loadConfig } from "../../src/core/configuration.mjs";
import { createLogger } from "../../src/core/logger.mjs";
import { MemoryPipelineRepository } from "../../src/pipeline/memory-repository.mjs";
import { PipelineService } from "../../src/ingestion/pipeline-service.mjs";
import { PrivateLocalStorage } from "../../src/storage/local-storage.mjs";
import { IdentityService } from "../../src/identity/service/identity-service.mjs";
import { ProfileService } from "../../src/profiles/profile-service.mjs";
import { VERSION } from "../../src/core/version.mjs";

const tenant = "11111111-1111-4111-8111-111111111111";
const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createTestServer() {
  const repository = new MemoryPipelineRepository();

  const storage = new PrivateLocalStorage({
    root: "./.test-storage-http",
  });

  const pipelineService = new PipelineService({
    repository,
    storage,
    securityContext: {},
    versions: VERSION,
  });

  const profileService = new ProfileService({
    repository,
  });

  const identityService = new IdentityService({
    repository: {
      async getTenantsForUser() {
        return [{
          status: "ACTIVE",
          tenant: {
            id: tenant,
            name: "A",
            slug: "a",
            status: "ACTIVE",
          },
          role: {
            code: "ADMIN",
          },
        }];
      },

      async getBasesForTenant() {
        return [];
      },

      async getCompaniesForTenant() {
        return [];
      },

      async getGroupsForTenant() {
        return [];
      },
    },
  });

  const config = loadConfig({
    NODE_ENV: "test",
    APP_NAME: "data-link-v6-http-test",
    HOST: "127.0.0.1",
    PORT: "0",
  });

  const logger = createLogger({
    level: "error",
    environment: "test",
    sink: {
      log() {},
      warn() {},
      error() {},
    },
  });

  const server = createHttpServer({
    config,
    logger,
    identityService,
    resolveAuthenticatedUser: async () => ({ id: user }),
    pipelineService,
    profileService,
  });

  return {
    server,
    repository,
  };
}

test("real HTTP server forwards JSON body to router", async (t) => {
  const { server, repository } = createTestServer();

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  t.after(() => server.close());

  const address = server.address();

  const response = await fetch(
    `http://127.0.0.1:${address.port}/sources`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": tenant,
      },
      body: JSON.stringify({
        name: "HTTP source",
        source_type: "FILE",
      }),
    },
  );

  assert.equal(response.status, 201);

  const body = await response.json();

  assert.equal(body.name, "HTTP source");
  assert.equal(body.tenant_id, tenant);
  assert.equal(repository.list("sources").length, 1);
});

test("real HTTP server forwards ingestion JSON body", async (t) => {
  const { server, repository } = createTestServer();

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  t.after(() => server.close());

  const address = server.address();

  const sourceResponse = await fetch(
    `http://127.0.0.1:${address.port}/sources`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": tenant,
      },
      body: JSON.stringify({
        name: "Import source",
        source_type: "FILE",
      }),
    },
  );

  assert.equal(sourceResponse.status, 201);

  const source = await sourceResponse.json();

  const content = Buffer
    .from("reference,designation\nA001,Article test\n")
    .toString("base64");

  const ingestionResponse = await fetch(
    `http://127.0.0.1:${address.port}/ingestion/files`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": tenant,
      },
      body: JSON.stringify({
        source_id: source.id,
        filename: "articles.csv",
        mime_type: "text/csv",
        content_base64: content,
      }),
    },
  );

  assert.equal(ingestionResponse.status, 201);

  const result = await ingestionResponse.json();

  assert.equal(result.duplicate, false);
  assert.equal(result.source_file.tenant_id, tenant);
  assert.equal(result.artifact.storage_provider, "local-private");

  assert.equal(repository.list("source_files").length, 1);
  assert.equal(repository.list("artifacts").length, 1);
});
