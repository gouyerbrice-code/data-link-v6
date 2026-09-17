import test from "node:test";
import assert from "node:assert/strict";
import { MemoryPipelineRepository } from "../../src/pipeline/memory-repository.mjs";
import { PipelineService } from "../../src/ingestion/pipeline-service.mjs";
import { PrivateLocalStorage } from "../../src/storage/local-storage.mjs";
import { RunService } from "../../src/runs/run-service.mjs";
import { ProfileService } from "../../src/profiles/profile-service.mjs";
import { PipelineExecutionService } from "../../src/pipeline/execution-service.mjs";
import { VERSION } from "../../src/core/version.mjs";

const tenantA="11111111-1111-4111-8111-111111111111", tenantB="22222222-2222-4222-8222-222222222222";
const ctxA={user_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",tenant_id:tenantA};
const ctxB={user_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",tenant_id:tenantB};

function setup(){
  const r=new MemoryPipelineRepository();
  const storage=new PrivateLocalStorage({root:"./.test-storage"});
  const security={}; // P2 Security Context is injected at the application boundary later.
  const pipeline=new PipelineService({repository:r,storage,securityContext:security,versions:VERSION});
  const runs=new RunService({repository:r,versions:VERSION});
  const profiles=new ProfileService({repository:r});
  const execution=new PipelineExecutionService({repository:r,runService:runs,profileService:profiles,versions:VERSION});
  return {r,pipeline,execution};
}

test("source → artifact → RAW → profiling → normalization → RUN → entity", async()=>{
  const {r,pipeline,execution}=setup();
  const source=await pipeline.createSource(ctxA,{name:"Test articles"});
  const csv=Buffer.from("reference,designation\n A-01 , Produit  Un\nA-02,Produit Deux\n");
  const ing=await pipeline.ingestFile(ctxA,{source_id:source.id,filename:"articles.csv",mime_type:"text/csv",buffer:csv});
  const raw=await pipeline.createRawSnapshot(ctxA,{source_file_id:ing.source_file.id,buffer:csv,filename:"articles.csv",mime_type:"text/csv"});
  const result=await execution.execute(ctxA,{sourceFileId:ing.source_file.id,configuration:{entity_type:"ARTICLE",identity_fields:["reference"],field_rules:{reference:["trim","uppercase"],designation:["collapse_whitespace"]}}});
  assert.equal(raw.status,"COMPLETE");
  assert.equal(result.run.status,"COMPLETED");
  assert.equal(result.entities.length,2);
  assert.equal(result.entities[0].normalized_payload.reference,"A-01");
  const e=result.entities[0];
  assert.equal(r.find("raw_records",e.source_record_id).snapshot_id,raw.id);
  assert.equal(r.find("source_files",e.source_file_id).source_id,source.id);
  assert.equal(r.find("sources",e.source_id).tenant_id,tenantA);
});

test("duplicate checksum is idempotent", async()=>{
  const {pipeline}=setup();
  const source=await pipeline.createSource(ctxA,{name:"S"});
  const b=Buffer.from('{"id":1}');
  const a=await pipeline.ingestFile(ctxA,{source_id:source.id,filename:"x.json",mime_type:"application/json",buffer:b});
  const d=await pipeline.ingestFile(ctxA,{source_id:source.id,filename:"x.json",mime_type:"application/json",buffer:b});
  assert.equal(d.duplicate,true);
  assert.equal(d.source_file.id,a.source_file.id);
});

test("same checksum in another tenant is not a cross-tenant duplicate", async()=>{
  const {r,pipeline}=setup();
  const sa=await pipeline.createSource(ctxA,{name:"A"});
  const sb=await pipeline.createSource(ctxB,{name:"B"});
  const b=Buffer.from('{"id":1}');
  const a=await pipeline.ingestFile(ctxA,{source_id:sa.id,filename:"x.json",mime_type:"application/json",buffer:b});
  const other=await pipeline.ingestFile(ctxB,{source_id:sb.id,filename:"x.json",mime_type:"application/json",buffer:b});
  assert.equal(other.duplicate,false);
  assert.notEqual(other.source_file.id,a.source_file.id);
});

test("RAW reprocessing creates a new immutable snapshot", async()=>{
  const {r,pipeline}=setup();
  const s=await pipeline.createSource(ctxA,{name:"S"});
  const b1=Buffer.from('{"a":1}');
  const ing=await pipeline.ingestFile(ctxA,{source_id:s.id,filename:"x.json",mime_type:"application/json",buffer:b1});
  const v1=await pipeline.createRawSnapshot(ctxA,{source_file_id:ing.source_file.id,buffer:b1,filename:"x.json",mime_type:"application/json"});
  const b2=Buffer.from('{"a":2}');
  const v2=await pipeline.createRawSnapshot(ctxA,{source_file_id:ing.source_file.id,buffer:b2,filename:"x.json",mime_type:"application/json"});
  assert.equal(v1.snapshot_version,1); assert.equal(v2.snapshot_version,2);
  assert.equal(r.list("raw_records",x=>x.snapshot_id===v1.id)[0].payload.a,1);
  assert.equal(r.list("raw_records",x=>x.snapshot_id===v2.id)[0].payload.a,2);
});

test("cross-tenant source access is denied", async()=>{
  const {pipeline}=setup();
  const s=await pipeline.createSource(ctxA,{name:"A"});
  await assert.rejects(pipeline.ingestFile(ctxB,{source_id:s.id,filename:"x.json",mime_type:"application/json",buffer:Buffer.from('{"a":1}')}),
    e=>e.code==="NOT_FOUND" || e.code==="TENANT_ACCESS_ERROR");
});
