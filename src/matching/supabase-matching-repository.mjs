export class SupabaseMatchingRepository {
  constructor({ supabase }) { if (!supabase?.client) throw new Error("SupabaseMatchingRepository requires a Supabase client"); this.db=supabase.client; }
  async getRun(tenantId, runId) { const {data,error}=await this.db.from("v6_runs").select("*").eq("tenant_id",tenantId).eq("id",runId).maybeSingle(); if(error)throw error; return data; }
  async getEntities(tenantId, ids) { if(!ids?.length)return []; const {data,error}=await this.db.from("v6_entities").select("*").eq("tenant_id",tenantId).in("id",ids); if(error)throw error; return data??[]; }
  async insertMatch(row) { const {data,error}=await this.db.from("v6_matches").insert(row).select().single(); if(error)throw error; return data; }
  async insertCandidates(rows) { if(!rows.length)return []; const {data,error}=await this.db.from("v6_match_candidates").insert(rows).select(); if(error)throw error; return data??[]; }
  async insertAnomaly(row) { const {data,error}=await this.db.from("v6_anomalies").insert(row).select().single(); if(error)throw error; return data; }
  async getMatch(tenantId, matchId) { const {data,error}=await this.db.from("v6_matches").select("*").eq("tenant_id",tenantId).eq("id",matchId).maybeSingle(); if(error)throw error; return data; }
  async insertDecision(row) { const {data,error}=await this.db.from("v6_match_decisions").insert(row).select().single(); if(error)throw error; return data; }
}
