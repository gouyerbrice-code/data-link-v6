import { randomUUID } from "node:crypto";

export class MemoryPipelineRepository {
  constructor() {
    this.tables = new Map();
    for (const t of ["sources","source_files","artifacts","raw_snapshots","raw_records","profiles","profile_versions","rules","rule_versions","synonyms","jobs","runs","steps","profiling_results","entities","matches","match_candidates","match_decisions","anomalies","masters"]) this.tables.set(t, new Map());
  }
  #t(name){return this.tables.get(name)}
  insert(table,row){const id=row.id??randomUUID(); const value={...row,id}; this.#t(table).set(id,value); return structuredClone(value)}
  insertMany(table,rows){return rows.map(row=>this.insert(table,row))}
  find(table,id){const x=this.#t(table).get(id);return x?structuredClone(x):null}
  list(table,predicate=()=>true){return [...this.#t(table).values()].filter(predicate).map(x=>structuredClone(x))}
  update(table,id,patch){const old=this.#t(table).get(id);if(!old)throw new Error(`Not found: ${table}/${id}`);const v={...old,...patch};this.#t(table).set(id,v);return structuredClone(v)}
  findBy(table,predicate){return this.list(table,predicate)}
}
