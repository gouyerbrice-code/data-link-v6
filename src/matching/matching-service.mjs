import { DataLinkError, ERROR_CODES } from "../core/errors.mjs";
import { MATCHING_ENGINE_MODES, normalizeMatchingInput } from "./contract.mjs";

export class MatchingService {
  constructor({ splink = null, fallback = null, defaultMode = MATCHING_ENGINE_MODES.SPLINK }) {
    this.splink = splink;
    this.fallback = fallback;
    this.defaultMode = defaultMode;
  }

  async compare(context, { left, right, settings = {}, mode = this.defaultMode }) {
    if (!context?.user_id || !context?.tenant_id) {
      throw new DataLinkError(ERROR_CODES.AUTHORIZATION_ERROR, "Security Context required", { status: 403 });
    }

    const input = {
      left: normalizeMatchingInput(left),
      right: normalizeMatchingInput(right),
      settings: { ...settings, tenant_id: context.tenant_id },
    };

    if (mode === MATCHING_ENGINE_MODES.SHADOW) {
      return this.runShadow(input, context.tenant_id);
    }

    if (mode === MATCHING_ENGINE_MODES.SPLINK) {
      if (!this.splink) {
        if (!this.fallback) {
          throw new DataLinkError(ERROR_CODES.EXTERNAL_PROVIDER_ERROR, "Splink engine is not configured", { status: 503 });
        }
        return this.runFallback(input, "splink_unavailable");
      }

      try {
        const result = await this.splink.link(input);
        return { ...result, tenant_id: context.tenant_id, fallback_used: false };
      } catch (error) {
        if (!this.fallback) throw error;
        return {
          ...await this.runFallback(input, "splink_error"),
          primary_engine: "splink",
          primary_error: {
            code: error?.code ?? ERROR_CODES.EXTERNAL_PROVIDER_ERROR,
            message: error?.message ?? "Splink request failed",
          },
        };
      }
    }

    if (mode === MATCHING_ENGINE_MODES.FALLBACK) {
      return this.runFallback(input, "explicit_fallback");
    }

    throw new DataLinkError(ERROR_CODES.VALIDATION_ERROR, "Unknown matching engine mode", { status: 400 });
  }

  async runShadow(input, tenantId) {
    if (!this.splink || !this.fallback) {
      throw new DataLinkError(
        ERROR_CODES.EXTERNAL_PROVIDER_ERROR,
        "Shadow mode requires both Splink and fallback engines",
        { status: 503 },
      );
    }

    const [splinkResult, fallbackResult] = await Promise.all([
      this.splink.link(input),
      this.fallback(input),
    ]);

    return {
      engine: "shadow",
      tenant_id: tenantId,
      primary: splinkResult,
      reference: fallbackResult,
      comparison: comparePairs(splinkResult?.pairs ?? [], fallbackResult?.pairs ?? []),
      fallback_used: false,
    };
  }

  async runFallback(input, reason) {
    if (!this.fallback) {
      throw new DataLinkError(ERROR_CODES.INTERNAL_ERROR, "Fallback matching engine is not configured", { status: 503 });
    }
    const result = await this.fallback(input);
    return {
      ...result,
      engine: result?.engine ?? "fallback",
      fallback_used: true,
      fallback_reason: reason,
    };
  }
}

function comparePairs(primary, reference) {
  const key = (pair) => `${pair.left_id}::${pair.right_id}`;
  const primarySet = new Set(primary.map(key));
  const referenceSet = new Set(reference.map(key));
  const intersection = [...primarySet].filter((item) => referenceSet.has(item));

  return {
    primary_pairs: primarySet.size,
    reference_pairs: referenceSet.size,
    common_pairs: intersection.length,
    primary_only_pairs: [...primarySet].filter((item) => !referenceSet.has(item)),
    reference_only_pairs: [...referenceSet].filter((item) => !primarySet.has(item)),
    agreement_rate: primarySet.size || referenceSet.size
      ? intersection.length / new Set([...primarySet, ...referenceSet]).size
      : 1,
  };
}
