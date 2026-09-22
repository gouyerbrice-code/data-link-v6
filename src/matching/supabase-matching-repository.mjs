export class SupabaseMatchingRepository {
  constructor({ supabase }) { if (!supabase?.client) throw new Error("SupabaseMatchingRepository requires a Supabase client"); this.db=supabase.client; }
  async getRun(tenantId, runId) { const {data,error}=await this.db.from("v6_runs").select("*").eq("tenant_id",tenantId).eq("id",runId).maybeSingle(); if(error)throw error; return data; }
  async getEntities(tenantId, ids) { if(!ids?.length)return []; const {data,error}=await this.db.from("v6_entities").select("*").eq("tenant_id",tenantId).in("id",ids); if(error)throw error; return data??[]; }
  async insertMatch(row) { const {data,error}=await this.db.from("v6_matches").insert(row).select().single(); if(error)throw error; return data; }
  async insertCandidates(rows) { if(!rows.length)return []; const {data,error}=await this.db.from("v6_match_candidates").insert(rows).select(); if(error)throw error; return data??[]; }
  async insertAnomaly(row) { const {data,error}=await this.db.from("v6_anomalies").insert(row).select().single(); if(error)throw error; return data; }
  async getMatch(tenantId, matchId) { const {data,error}=await this.db.from("v6_matches").select("*").eq("tenant_id",tenantId).eq("id",matchId).maybeSingle(); if(error)throw error; return data; }
  async insertDecision(row) { const {data,error}=await this.db.from("v6_match_decisions").insert(row).select().single(); if(error)throw error; return data; }
  async updateMatch(tenantId, matchId, patch) { const {data,error}=await this.db.from("v6_matches").update({...patch,updated_at:new Date().toISOString()}).eq("tenant_id",tenantId).eq("id",matchId).select().single(); if(error)throw error; return data; }
  async listMatches(tenantId, runId=null) { let q=this.db.from("v6_matches").select("*").eq("tenant_id",tenantId).order("created_at",{ascending:false}); if(runId) q=q.eq("run_id",runId); const {data,error}=await q; if(error)throw error; return data??[]; }
  async listCandidates(tenantId, matchId) { const {data,error}=await this.db.from("v6_match_candidates").select("*").eq("tenant_id",tenantId).eq("match_id",matchId).order("rank",{ascending:true}); if(error)throw error; return data??[]; }
  async listDecisions(tenantId, matchId=null) { let q=this.db.from("v6_match_decisions").select("*").eq("tenant_id",tenantId).order("created_at",{ascending:false}); if(matchId) q=q.eq("match_id",matchId); const {data,error}=await q; if(error)throw error; return data??[]; }
  async listAnomalies(tenantId, runId=null) { let q=this.db.from("v6_anomalies").select("*").eq("tenant_id",tenantId).order("created_at",{ascending:false}); if(runId) q=q.eq("run_id",runId); const {data,error}=await q; if(error)throw error; return data??[]; }
}
