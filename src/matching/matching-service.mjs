import { randomUUID } from "node:crypto";
import { DataLinkError, ERROR_CODES } from "../core/errors.mjs";
import { generateCandidates } from "./candidate-generator.mjs";
import { scorePair, MATCH_ENGINE_VERSION, normalizeValue, designationTokens } from "./matcher.mjs";

export class MatchingService {
  constructor({ repository }) { this.r=repository; }
  #ctx(ctx) { if(!ctx?.tenant_id || !ctx?.user_id) throw new DataLinkError(ERROR_CODES.AUTHORIZATION_ERROR,"Security Context required",{status:403}); }
  async execute(ctx,{runId,sourceEntityIds=[],canonicalEntityIds=[],fields={},maxCandidates=50,scope="GROUP"}) {
    this.#ctx(ctx); const run=await this.r.getRun(ctx.tenant_id,runId); if(!run)throw new DataLinkError(ERROR_CODES.NOT_FOUND,"Run not found",{status:404});
    const [sources,canonicals]=await Promise.all([this.r.getEntities(ctx.tenant_id,sourceEntityIds),this.r.getEntities(ctx.tenant_id,canonicalEntityIds)]);
    if(sources.length!==sourceEntityIds.length||canonicals.length!==canonicalEntityIds.length)throw new DataLinkError(ERROR_CODES.NOT_FOUND,"Entity not found",{status:404});
    const tokenFrequency=new Map(); for(const e of canonicals)for(const t of designationTokens(e.normalized_payload?.[fields.designation??"designation"]))tokenFrequency.set(t,(tokenFrequency.get(t)??0)+1);
    const pairs=generateCandidates(sources,canonicals,{fields,maxCandidates,tokenFrequency});
    const bySource=new Map(); for(const pair of pairs){const result=scorePair(pair.left,pair.right,{fields,signalStats:{designationTokenFrequency:tokenFrequency}}); const rows=bySource.get(pair.left.id)??[]; rows.push({...pair,result});bySource.set(pair.left.id,rows);}
    const matches=[],candidates=[],anomalies=[];
    for(const [sourceId,rows] of bySource){ rows.sort((a,b)=>b.result.score-a.result.score || b.blocking_priority-a.blocking_priority); const top=rows[0]; const tied=rows.filter(x=>Math.abs(x.result.score-top.result.score)<0.0001); const decision=tied.length>1 && top.result.decision!=="NO_MATCH"?"COLLISION":top.result.decision;
      const match=await this.r.insertMatch({id:randomUUID(),tenant_id:ctx.tenant_id,run_id:runId,entity_a_id:sourceId,entity_b_id:top.right.id,scope,score:Number(top.result.score.toFixed(4)),confidence:Number(top.result.confidence.toFixed(4)),decision,status:"ANALYZED",reason:decision,evidence:top.result.evidence,engine_version:MATCH_ENGINE_VERSION}); matches.push(match);
      const candidateRows=rows.map((row,i)=>({tenant_id:ctx.tenant_id,match_id:match.id,candidate_entity_id:row.right.id,rank:i+1,score:Number(row.result.score.toFixed(4)),confidence:Number(row.result.confidence.toFixed(4)),reference_score:row.result.scores.reference,designation_score:row.result.scores.designation,brand_score:row.result.scores.brand,barcode_score:row.result.scores.barcode,supplier_reference_score:row.result.scores.supplier_reference,signals:row.result.signals,evidence:row.result.evidence}));
      candidates.push(...await this.r.insertCandidates(candidateRows));
      if(decision==="COLLISION") anomalies.push(await this.r.insertAnomaly({tenant_id:ctx.tenant_id,run_id:runId,entity_type:"MATCH",entity_id:match.id,severity:"HIGH",code:"MATCH_COLLISION",message:"Multiple candidates have the same top score",evidence:{source_entity_id:sourceId,candidate_count:tied.length}}));
    }
    return {engine_version:MATCH_ENGINE_VERSION,run_id:runId,matches,candidates,anomalies};
  }
  async decide(ctx,{matchId,decision,justification}) { this.#ctx(ctx); const allowed=new Set(["IDENTIQUE","MATCH_FORT","A_CONTROLER","COLLISION","NO_MATCH"]); if(!allowed.has(decision)||!String(justification??"").trim())throw new DataLinkError(ERROR_CODES.VALIDATION_ERROR,"decision and justification are required",{status:400}); const match=await this.r.getMatch(ctx.tenant_id,matchId); if(!match)throw new DataLinkError(ERROR_CODES.NOT_FOUND,"Match not found",{status:404}); const updated=await this.r.updateMatch(ctx.tenant_id,matchId,{decision,status:"VALIDATED",reason:justification.trim()}); const decisionRow=await this.r.insertDecision({id:randomUUID(),tenant_id:ctx.tenant_id,match_id:matchId,decision,justification:justification.trim(),decision_source:"USER",user_id:ctx.user_id,engine_version:MATCH_ENGINE_VERSION}); return {match:updated,decision:decisionRow}; }
  async listMatches(ctx,runId=null){this.#ctx(ctx);return this.r.listMatches(ctx.tenant_id,runId);}
  async getMatchDetail(ctx,matchId){this.#ctx(ctx);const match=await this.r.getMatch(ctx.tenant_id,matchId);if(!match)throw new DataLinkError(ERROR_CODES.NOT_FOUND,"Match not found",{status:404});const [candidates,decisions]=await Promise.all([this.r.listCandidates(ctx.tenant_id,matchId),this.r.listDecisions(ctx.tenant_id,matchId)]);return {match,candidates,decisions};}
  async listAnomalies(ctx,runId=null){this.#ctx(ctx);return this.r.listAnomalies(ctx.tenant_id,runId);}
}
