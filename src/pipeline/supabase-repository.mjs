const TABLES = {
  sources: "v6_sources",
  source_files: "v6_source_files",
  artifacts: "v6_source_artifacts",
  raw_snapshots: "v6_raw_snapshots",
  raw_records: "v6_raw_records",
  profiles: "v6_profiles",
  profile_versions: "v6_profile_versions",
  rules: "v6_rules",
  rule_versions: "v6_rule_versions",
  synonyms: "v6_synonyms",
  jobs: "v6_processing_jobs",
  runs: "v6_runs",
  steps: "v6_run_steps",
  profiling_results: "v6_profiling_results",
  entities: "v6_entities",
};

export class SupabasePipelineRepository {
  constructor({ supabase }) {
    if (!supabase?.client) throw new Error("SupabasePipelineRepository requires a Supabase client");
    this.db = supabase.client;
  }

  table(name) {
    const table = TABLES[name];
    if (!table) throw new Error(`Unknown pipeline table: ${name}`);
    return table;
  }

  async insert(name, row) {
    const { data, error } = await this.db.from(this.table(name)).insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async find(name, id) {
    const { data, error } = await this.db.from(this.table(name)).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  async list(name) {
    const { data, error } = await this.db.from(this.table(name)).select("*");
    if (error) throw error;
    return data ?? [];
  }

  async findBy(name, predicate) {
    const rows = await this.list(name);
    return rows.filter(predicate);
  }

  async update(name, id, patch) {
    const { data, error } = await this.db.from(this.table(name)).update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }
}
