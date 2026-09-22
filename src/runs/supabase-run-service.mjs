import { RunService } from "./run-service.mjs";

export class SupabaseRunService {
  constructor({ repository, versions }) { this.r=repository; this.v=versions; }

  ctx(c){ return new RunService({repository:null,versions:this.v}).ctx(c); }

  async create(c,args){
    this.ctx(c);
    const key=args.idempotency_key ?? `${c.tenant_id}:${args.execution_id ?? crypto.randomUUID()}`;
    const jobs=await this.r.findBy("jobs",x=>x.tenant_id===c.tenant_id&&x.idempotency_key===key);
    if(jobs[0]){
      const runs=await this.r.findBy("runs",x=>x.job_id===jobs[0].id);
      if(runs[0]) return runs[0];
    }
    const execution_id=args.execution_id ?? crypto.randomUUID();
    const job=await this.r.insert("jobs",{tenant_id:c.tenant_id,source_file_id:args.source_file_id??null,job_type:args.job_type??"PIPELINE",status:"PENDING",priority:0,idempotency_key:key,created_at:new Date().toISOString()});
    return this.r.insert("runs",{execution_id,tenant_id:c.tenant_id,job_id:job.id,engine_mode:"V6_NATIVE",engine_version:this.v.engine_version,profile_version_id:args.profile_version_id??null,rule_version_id:args.rule_version_id??null,configuration_version:args.configuration_version??null,configuration_hash:args.configuration_hash??null,status:"PENDING",progress:0,retry_count:0,statistics:{},errors:[],created_at:new Date().toISOString()});
  }

  async step(c,runId,args){
    this.ctx(c); const run=await this.r.find("runs",runId);
    if(!run||run.tenant_id!==c.tenant_id) throw new Error("Run not found");
    const existing=(await this.r.findBy("steps",x=>x.run_id===runId&&(x.idempotency_key===args.idempotency_key||x.sequence===args.sequence)))[0];
    if(existing)return existing;
    return this.r.insert("steps",{run_id:runId,step_type:args.step_type,sequence:args.sequence,status:"PENDING",idempotency_key:args.idempotency_key,progress:0,input:{},output:{},errors:[],created_at:new Date().toISOString()});
  }

  async transition(c,runId,status,patch={}){
    this.ctx(c); const run=await this.r.find("runs",runId);
    if(!run||run.tenant_id!==c.tenant_id) throw new Error("Run not found");
    const allowed={PENDING:["RUNNING","CANCELLED"],RUNNING:["COMPLETED","FAILED","CANCELLED"],FAILED:["RUNNING","CANCELLED"],COMPLETED:[],CANCELLED:[]};
    if(run.status!==status&&!allowed[run.status].includes(status)) throw new Error(`Invalid RUN transition: ${run.status} -> ${status}`);
    const now=new Date().toISOString();
    return this.r.update("runs",runId,{status,...patch,...(status==="RUNNING"?{started_at:now,heartbeat_at:now,finished_at:null,retry_count:run.status==="FAILED"?run.retry_count+1:run.retry_count}:{}),...(status==="COMPLETED"||status==="FAILED"||status==="CANCELLED"?{finished_at:now}:{})});
  }

  async stepTransition(c,stepId,status,patch={}){
    this.ctx(c); const s=await this.r.find("steps",stepId); if(!s)throw new Error("Step not found");
    const run=await this.r.find("runs",s.run_id); if(!run||run.tenant_id!==c.tenant_id)throw new Error("Step not found");
    const allowed={PENDING:["RUNNING","SKIPPED","CANCELLED"],RUNNING:["COMPLETED","FAILED","CANCELLED"],FAILED:["RUNNING","CANCELLED"],COMPLETED:[],SKIPPED:[],CANCELLED:[]};
    if(s.status!==status&&!allowed[s.status].includes(status))throw new Error(`Invalid STEP transition: ${s.status} -> ${status}`);
    const now=new Date().toISOString();
    return this.r.update("steps",stepId,{status,...patch,...(status==="RUNNING"?{started_at:now}:{}),...(status==="COMPLETED"||status==="FAILED"||status==="CANCELLED"?{finished_at:now}:{})});
  }
}
