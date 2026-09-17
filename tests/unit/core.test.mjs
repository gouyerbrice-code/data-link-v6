import test from "node:test";
import assert from "node:assert/strict";
import { ERROR_CODES, DataLinkError, errorPayload } from "../../src/core/errors.mjs";
import { loadConfig } from "../../src/core/configuration.mjs";
import { createLogger } from "../../src/core/logger.mjs";
import { createRequestContext } from "../../src/core/request-context.mjs";
import { VERSION } from "../../src/core/version.mjs";

test("configuration has isolated environment/version defaults", () => {
  const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "debug", APP_NAME: "data-link-v6-test" });
  assert.equal(config.app.environment, "test");
  assert.equal(config.version.product_version, VERSION.product_version);
  assert.equal(config.version.engine_version, "0.0.0");
});

test("configuration rejects unsupported environment", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "invalid" }), /Unsupported NODE_ENV/);
});

test("error contract is stable", () => {
  const error = new DataLinkError(ERROR_CODES.CONFLICT, "Conflict", { status: 409, details: { key: "x" } });
  assert.deepEqual(errorPayload(error, "req-1"), {
    error: {
      code: "CONFLICT",
      message: "Conflict",
      details: { key: "x" },
      request_id: "req-1",
    },
  });
});

test("unknown errors are not leaked", () => {
  const payload = errorPayload(new Error("secret internal detail"), "req-2");
  assert.equal(payload.error.code, "INTERNAL_ERROR");
  assert.equal(payload.error.message, "Internal server error");
  assert.equal(payload.error.request_id, "req-2");
});

test("logger redacts sensitive values", () => {
  const lines = [];
  const sink = { log: (line) => lines.push(line), warn: (line) => lines.push(line), error: (line) => lines.push(line) };
  const logger = createLogger({ level: "debug", environment: "test", sink });
  logger.info("test.event", {
    token: "secret-token",
    password: "secret-password",
    safe: "visible",
  });
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.token, "[REDACTED]");
  assert.equal(parsed.password, "[REDACTED]");
  assert.equal(parsed.safe, "visible");
});

test("request context accepts a safe request id and otherwise generates one", () => {
  const supplied = createRequestContext({ "x-request-id": "req-123" });
  assert.equal(supplied.request_id, "req-123");
  const generated = createRequestContext({ "x-request-id": "bad id with spaces" });
  assert.match(generated.request_id, /^[0-9a-f-]{36}$/);
});
