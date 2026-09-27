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

    if (mode === MATCHING_ENGINE_MODES.SPLINK) {
      if (!this.splink) {
        if (!this.fallback) throw new DataLinkError(ERROR_CODES.INTERNAL_ERROR, "Splink engine is not configured", { status: 503 });
        return this.runFallback(input, "splink_unavailable");
      }
      try {
        const result = await this.splink.link(input);
        return { ...result, tenant_id: context.tenant_id, fallback_used: false };
      } catch (error) {
        if (!this.fallback) throw error;
        return this.runFallback(input, "splink_error");
      }
    }

    if (mode === MATCHING_ENGINE_MODES.FALLBACK) return this.runFallback(input, "explicit_fallback");

    throw new DataLinkError(ERROR_CODES.VALIDATION_ERROR, "Unknown matching engine mode", { status: 400 });
  }

  async runFallback(input, reason) {
    if (!this.fallback) throw new DataLinkError(ERROR_CODES.INTERNAL_ERROR, "Fallback matching engine is not configured", { status: 503 });
    const result = await this.fallback(input);
    return { ...result, engine: result?.engine ?? "fallback", fallback_used: true, fallback_reason: reason };
  }
}
