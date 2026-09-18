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

test("real HTTP server accepts multipart file ingestion", async (t) => {
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
        name: "Multipart source",
        source_type: "FILE",
      }),
    },
  );

  assert.equal(sourceResponse.status, 201);

  const source = await sourceResponse.json();

  const form = new FormData();
  form.append(
    "file",
    new Blob(
      ["reference,designation\nA001,Article test\n"],
      { type:"text/csv" },
    ),
    "articles.csv",
  );
  form.append("source_id", source.id);
  form.append("metadata", JSON.stringify({ test:true }));

  const ingestionResponse = await fetch(
    `http://127.0.0.1:${address.port}/ingestion/files`,
    {
      method: "POST",
      headers: {
        "x-tenant-id": tenant,
        "Idempotency-Key": "http-multipart-p31-001",
      },
      body: form,
    },
  );

  assert.equal(ingestionResponse.status, 201);

  const result = await ingestionResponse.json();

  assert.equal(result.duplicate, false);
  assert.equal(result.idempotent_replay, undefined);
  assert.equal(result.source_file.tenant_id, tenant);
  assert.equal(result.source_file.original_name, "articles.csv");
  assert.equal(result.artifact.storage_provider, "local-private");

  assert.equal(repository.list("source_files").length, 1);
  assert.equal(repository.list("artifacts").length, 1);
});

test("multipart ingestion is idempotent for the same Idempotency-Key", async (t) => {
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
        name: "Idempotency source",
        source_type: "FILE",
      }),
    },
  );

  const source = await sourceResponse.json();

  async function upload() {
    const form = new FormData();

    form.append(
      "file",
      new Blob(["a,b\n1,2\n"], { type:"text/csv" }),
      "idempotent.csv",
    );

    form.append("source_id", source.id);

    return fetch(
      `http://127.0.0.1:${address.port}/ingestion/files`,
      {
        method:"POST",
        headers:{
          "x-tenant-id":tenant,
          "Idempotency-Key":"http-idempotency-p31-001",
        },
        body:form,
      },
    );
  }

  const first = await upload();
  const firstBody = await first.json();

  const second = await upload();
  const secondBody = await second.json();

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(firstBody.source_file.id, secondBody.source_file.id);
  assert.equal(secondBody.idempotent_replay, true);

  assert.equal(repository.list("source_files").length, 1);
  assert.equal(repository.list("artifacts").length, 1);
});

test("multipart ingestion rejects non-multipart payloads", async () => {
  const { server } = createTestServer();

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/ingestion/files`,
      {
        method:"POST",
        headers:{
          "content-type":"application/json",
          "x-tenant-id":tenant,
        },
        body:JSON.stringify({
          source_id:"missing",
          content_base64:"abc",
        }),
      },
    );

    assert.equal(response.status, 400);

    const body = await response.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
  } finally {
    server.close();
  }
});
