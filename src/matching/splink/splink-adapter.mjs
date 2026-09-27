import { DataLinkError, ERROR_CODES } from "../../core/errors.mjs";

export class SplinkAdapter {
  constructor({ baseUrl, fetchImpl = fetch, timeoutMs = 60000 }) {
    if (!baseUrl) throw new Error("Splink service base URL is required");
    this.baseUrl = String(baseUrl).replace(/\/$/, "");
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async link({ left, right, settings = {}, signal }) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      throw new DataLinkError(
        ERROR_CODES.VALIDATION_ERROR,
        "Splink adapter expects left and right arrays",
        { status: 400 },
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    if (signal) {
      if (signal.aborted) controller.abort();
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      const response = await this.fetch(this.baseUrl + "/v1/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ left, right, settings }),
        signal: controller.signal,
      });

      let payload = null;
      try { payload = await response.json(); } catch {}

      if (!response.ok) {
        throw new DataLinkError(
          ERROR_CODES.INTERNAL_ERROR,
          payload?.error?.message ?? ("Splink service returned HTTP " + response.status),
          { status: 502, details: { provider: "splink", status: response.status } },
        );
      }

      return normalizeSplinkResponse(payload);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new DataLinkError(
          ERROR_CODES.INTERNAL_ERROR,
          "Splink service timed out",
          { status: 504, details: { provider: "splink", timeout_ms: this.timeoutMs } },
        );
      }
      if (error instanceof DataLinkError) throw error;
      throw new DataLinkError(
        ERROR_CODES.INTERNAL_ERROR,
        "Splink service unavailable",
        { status: 502, details: { provider: "splink", cause: error?.message } },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function normalizeSplinkResponse(payload) {
  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
  return {
    engine: "splink",
    version: payload?.version ?? null,
    pairs: pairs
      .filter((p) => p?.left_id != null && p?.right_id != null)
      .map((p) => ({
        left_id: String(p.left_id),
        right_id: String(p.right_id),
        match_probability: numberOrNull(p.match_probability),
        match_weight: numberOrNull(p.match_weight),
        cluster_id: p.cluster_id == null ? null : String(p.cluster_id),
      })),
    statistics: payload?.statistics ?? {},
  };
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
