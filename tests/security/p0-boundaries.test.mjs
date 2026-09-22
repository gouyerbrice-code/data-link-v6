import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../../src/core/configuration.mjs";

test("P0/P1 has no V5 path or secret configuration", () => {
  const config = loadConfig({ NODE_ENV: "test" });
  assert.equal(config.app.name, "data-link-v6");
  assert.equal(config.version.engine_version, "V6-MATCH-2.3");
  assert.equal(config.supabase.url, null);
  assert.equal(config.supabase.anonKey, null);
});
