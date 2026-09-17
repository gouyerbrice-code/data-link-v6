import test from "node:test";
import assert from "node:assert/strict";
import { createRouter } from "../../src/api/router.mjs";
import { loadConfig } from "../../src/core/configuration.mjs";
import { createLogger } from "../../src/core/logger.mjs";

const config = loadConfig({ NODE_ENV: "test", APP_NAME: "data-link-v6-test" });
const logger = createLogger({ level: "error", environment: "test", sink: { log() {}, warn() {}, error() {} } });
const router = createRouter({ config, logger });

test("GET /health", async () => {
  const response = await router.handle(new Request("http://localhost/health"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.ok(body.request_id);
});

test("GET /ready", async () => {
  const response = await router.handle(new Request("http://localhost/ready"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ready");
});

test("unknown route uses central error shape", async () => {
  const response = await router.handle(new Request("http://localhost/not-found"));
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error.code, "NOT_FOUND");
  assert.ok(body.error.request_id);
});

test("request id is propagated", async () => {
  const response = await router.handle(new Request("http://localhost/health", {
    headers: { "x-request-id": "integration-42" },
  }));
  assert.equal(response.headers.get("x-request-id"), "integration-42");
  const body = await response.json();
  assert.equal(body.request_id, "integration-42");
});
