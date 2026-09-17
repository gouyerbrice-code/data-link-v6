import { createHash } from "node:crypto";
import { profileRows } from "../profiling/profiler.mjs";
import { normalizePayload } from "../normalization/engine.mjs";
import { DataLinkError, ERROR_CODES } from "../core/errors.mjs";

export class PipelineExecutionService {
  constructor({ repository, runService, profileService, versions }) {
    this.r=repository; this.runs=runService; this.profiles=profileService; this.v=versions;
  }

  async execute(ctx,{sourceFileId,profileVersionId=null,ruleVersionId=null,configuration={}}) {
    if(!ctx?.user_id||!ctx?.tenant_id) throw new DataLinkError(ERROR_CODES.AUTHORIZATION_ERROR,"Security Context required",{status:403});
    const sf=this.r.find("source_files",sourceFileId);
    if(!sf||sf.tenant_id!==ctx.tenant_id) throw new DataLinkError(ERROR_CODES.NOT_FOUND,"Source file not found",{status:404});
    const snaps=this.r.findBy("raw_snapshots",x=>x.source_file_id===sourceFileId&&x.tenant_id===ctx.tenant_id).sort((a,b)=>b.snapshot_version-a.snapshot_version);
    const snap=snaps[0]; if(!snap) throw new DataLinkError(ERROR_CODES.NOT_FOUND,"RAW snapshot not found",{status:404});
    const configSnap=this.profiles.snapshotConfiguration({profileVersionId,ruleVersionId,configuration});
    const run=this.runs.create(ctx,{source_file_id:sourceFileId,profile_version_id:profileVersionId,rule_version_id:ruleVersionId,configuration_version:configSnap.configuration_version,configuration_hash:configSnap.configuration_hash});
    this.runs.transition(ctx,run.id,"RUNNING",{worker:"local"});
    const rawStep=this.runs.step(ctx,run.id,{step_type:"RAW",sequence:1,idempotency_key:`${run.execution_id}:RAW:${snap.id}`});
    this.runs.stepTransition(ctx,rawStep.id,"RUNNING");
    this.runs.stepTransition(ctx,rawStep.id,"COMPLETED",{progress:100,output:{snapshot_id:snap.id,record_count:snap.record_count}});
    const rows=this.r.list("raw_records",x=>x.snapshot_id===snap.id&&x.tenant_id===ctx.tenant_id).sort((a,b)=>a.record_number-b.record_number);
    const profileStep=this.runs.step(ctx,run.id,{step_type:"PROFILING",sequence:2,idempotency_key:`${run.execution_id}:PROFILING:${snap.id}`});
    this.runs.stepTransition(ctx,profileStep.id,"RUNNING");
    const prof=profileRows(rows.map(x=>x.payload));
    const pr=this.r.insert("profiling_results",{tenant_id:ctx.tenant_id,run_id:run.id,raw_snapshot_id:snap.id,domain:prof.domain,confidence:prof.confidence,row_count:prof.row_count,column_count:prof.column_count,result:prof,created_at:new Date().toISOString()});
    this.runs.stepTransition(ctx,profileStep.id,"COMPLETED",{progress:100,output:{profiling_result_id:pr.id,domain:prof.domain,confidence:prof.confidence}});
    const normStep=this.runs.step(ctx,run.id,{step_type:"NORMALIZATION",sequence:3,idempotency_key:`${run.execution_id}:NORMALIZATION:${snap.id}`});
    this.runs.stepTransition(ctx,normStep.id,"RUNNING");
    const fieldRules=configuration.field_rules??{};
    const entities=[];
    for(const raw of rows){
      const normalized=normalizePayload(raw.payload,fieldRules);
      const identity={};
      for(const key of (configuration.identity_fields??[])) if(raw.payload[key]!==undefined) identity[key]=raw.payload[key];
      const existing=this.r.findBy("entities",e=>e.tenant_id===ctx.tenant_id&&e.run_id===run.id&&e.source_record_id===raw.id&&e.version===1)[0];
      if(!existing) entities.push(this.r.insert("entities",{tenant_id:ctx.tenant_id,entity_type:configuration.entity_type??prof.domain,source_id:sf.source_id,source_file_id:sourceFileId,source_record_id:raw.id,run_id:run.id,normalized_payload:normalized,identity_payload:identity,version:1,status:"ACTIVE",created_at:new Date().toISOString(),updated_at:new Date().toISOString()}));
    }
    this.runs.stepTransition(ctx,normStep.id,"COMPLETED",{progress:100,output:{entity_count:entities.length}});
    this.runs.transition(ctx,run.id,"COMPLETED",{progress:100,statistics:{raw_records:rows.length,entities:entities.length,profiling_domain:prof.domain}});
    return {run:this.r.find("runs",run.id),profiling:pr,entities};
  }
}
