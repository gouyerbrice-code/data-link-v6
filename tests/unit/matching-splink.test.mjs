import test from "node:test";
import assert from "node:assert/strict";
import { SplinkAdapter, MatchingService, exactFallback } from "../../src/matching/index.mjs";

test("Splink adapter normalizes link response", async () => {
  const adapter = new SplinkAdapter({
    baseUrl: "http://splink",
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "POST");
      const body = JSON.parse(options.body);
      assert.equal(body.left.length, 1);
      return new Response(JSON.stringify({
        version: "1",
        pairs: [{ left_id: "A", right_id: "B", match_probability: "0.93", match_weight: 4.2 }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const result = await adapter.link({ left: [{ id: "A" }], right: [{ id: "B" }] });
  assert.equal(result.engine, "splink");
  assert.equal(result.pairs[0].match_probability, 0.93);
});

test("matching service falls back when Splink fails", async () => {
  const service = new MatchingService({
    splink: { link: async () => { throw new Error("offline"); } },
    fallback: exactFallback,
  });

  const result = await service.compare(
    { user_id: "u1", tenant_id: "t1" },
    {
      left: [{ id: "A", ean: "123" }],
      right: [{ id: "B", ean: "123" }],
    },
  );

  assert.equal(result.engine, "fallback");
  assert.equal(result.fallback_used, true);
  assert.equal(result.primary_engine, "splink");
  assert.equal(result.primary_error.message, "offline");
});

test("shadow mode compares Splink with deterministic reference", async () => {
  const service = new MatchingService({
    splink: {
      link: async () => ({
        engine: "splink",
        pairs: [{ left_id: "A", right_id: "B", match_probability: 0.93 }],
      }),
    },
    fallback: exactFallback,
  });

  const result = await service.compare(
    { user_id: "u1", tenant_id: "tenant-A" },
    {
      left: [{ id: "A", ean: "123" }],
      right: [{ id: "B", ean: "123" }],
      mode: "shadow",
    },
  );

  assert.equal(result.engine, "shadow");
  assert.equal(result.tenant_id, "tenant-A");
  assert.equal(result.comparison.common_pairs, 1);
  assert.equal(result.comparison.agreement_rate, 1);
});
