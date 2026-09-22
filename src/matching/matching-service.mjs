import { randomUUID } from "node:crypto";
import { DataLinkError, ERROR_CODES } from "../core/errors.mjs";
import { generateCandidates } from "./candidate-generator.mjs";
import { scorePair, MATCH_ENGINE_VERSION } from "./matcher.mjs";

export class MatchingService {
  constructor({ repository }) { this.r = repository; }
  #ctx(ctx) { if (!ctx?.tenant_id || !ctx?.user_id) throw new DataLinkError(ERROR_CODES.AUTHORIZATION_ERROR, "Security Context required", { status: 403 }); }
  execute(ctx, { runId, sourceEntityIds, canonicalEntityIds, fields = {} }) {
    this.#ctx(ctx);
    const run = this.r.find("runs", runId);
    if (!run || run.tenant_id !== ctx.tenant_id) throw new DataLinkError(ERROR_CODES.NOT_FOUND, "Run not found", { status: 404 });
    const owned = (ids) => ids.map((id) => this.r.find("entities", id)).map((entity) => {
      if (!entity || entity.tenant_id !== ctx.tenant_id) throw new DataLinkError(ERROR_CODES.NOT_FOUND, "Entity not found", { status: 404 }); return entity;
    });
    const sources = owned(sourceEntityIds), canonicals = owned(canonicalEntityIds);
    const pairs = generateCandidates(sources, canonicals, fields);
    const candidates = pairs.map(({ left, right }) => this.r.insert("match_candidates", { tenant_id: ctx.tenant_id, run_id: runId, source_entity_id: left.id, canonical_entity_id: right.id, created_at: new Date().toISOString() }));
    const scored = pairs.map(({ left, right }, index) => ({ candidate: candidates[index], source: left, canonical: right, result: scorePair(left, right, fields) }));
    const matches = [];
    for (const [sourceId, rows] of Map.groupBy(scored, (row) => row.source.id)) {
      const top = Math.max(...rows.map((row) => row.result.score)); const winners = rows.filter((row) => row.result.score === top);
      for (const row of winners) {
        const decision = winners.length > 1 && row.result.decision !== "NO_MATCH" ? "COLLISION" : row.result.decision;
        const match = this.r.insert("matches", { id: randomUUID(), tenant_id: ctx.tenant_id, run_id: runId, source_entity_id: sourceId, canonical_entity_id: row.canonical.id, candidate_id: row.candidate.id, engine_version: MATCH_ENGINE_VERSION, score: row.result.score, proposed_decision: decision, signals: row.result.signals, created_at: new Date().toISOString() });
        matches.push(match);
        if (decision === "COLLISION") this.r.insert("anomalies", { tenant_id: ctx.tenant_id, run_id: runId, anomaly_type: "COLLISION", source_entity_id: sourceId, details: { candidate_count: winners.length }, created_at: new Date().toISOString() });
      }
    }
    return { engine_version: MATCH_ENGINE_VERSION, candidates, matches, anomalies: this.r.findBy("anomalies", (row) => row.run_id === runId && row.tenant_id === ctx.tenant_id) };
  }
  decide(ctx, { matchId, decision, rationale = null }) {
    this.#ctx(ctx); if (!new Set(["IDENTIQUE", "MATCH_FORT", "A_CONTROLER", "COLLISION", "NO_MATCH"]).has(decision)) throw new DataLinkError(ERROR_CODES.VALIDATION_ERROR, "Invalid decision", { status: 400 });
    const match = this.r.find("matches", matchId); if (!match || match.tenant_id !== ctx.tenant_id) throw new DataLinkError(ERROR_CODES.NOT_FOUND, "Match not found", { status: 404 });
    const existing = this.r.findBy("match_decisions", (row) => row.match_id === matchId && row.tenant_id === ctx.tenant_id)[0];
    if (existing) return this.r.update("match_decisions", existing.id, { decision, rationale, decided_by: ctx.user_id, decided_at: new Date().toISOString() });
    return this.r.insert("match_decisions", { tenant_id: ctx.tenant_id, match_id: matchId, decision, rationale, decided_by: ctx.user_id, decided_at: new Date().toISOString() });
  }
}
