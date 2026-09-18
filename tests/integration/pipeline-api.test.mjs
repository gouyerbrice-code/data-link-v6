import test from "node:test";
import assert from "node:assert/strict";
import { createRouter } from "../../src/api/router.mjs";
import { loadConfig } from "../../src/core/configuration.mjs";
import { createLogger } from "../../src/core/logger.mjs";
import { MemoryPipelineRepository } from "../../src/pipeline/memory-repository.mjs";
import { PipelineService } from "../../src/ingestion/pipeline-service.mjs";
import { PrivateLocalStorage } from "../../src/storage/local-storage.mjs";
import { IdentityService } from "../../src/identity/service/identity-service.mjs";
import { ProfileService } from "../../src/profiles/profile-service.mjs";
import { VERSION } from "../../src/core/version.mjs";

const tenant="11111111-1111-4111-8111-111111111111", user="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const r=new MemoryPipelineRepository();
const storage=new PrivateLocalStorage({root:"./.test-storage-api"});
const pipeline=new PipelineService({repository:r,storage,securityContext:{},versions:VERSION});
const identity=new IdentityService({repository:{
  async getTenantsForUser(){return [{status:"ACTIVE",tenant:{id:tenant,name:"A",slug:"a",status:"ACTIVE"},role:{code:"ADMIN"}}]},
  async getBasesForTenant(){return[]},async getCompaniesForTenant(){return[]},async getGroupsForTenant(){return[]}
}});
const profiles=new ProfileService({repository:r});
const config=loadConfig({NODE_ENV:"test",APP_NAME:"data-link-v6-test"});
const logger=createLogger({level:"error",environment:"test",sink:{log(){},warn(){},error(){}}});
const router=createRouter({config,logger,identityService:identity,resolveAuthenticatedUser:async()=>user,pipelineService:pipeline,profileService:profiles});

test("POST /sources then GET /sources",async()=>{
  const post=await router.handle(new Request("http://localhost/sources",{method:"POST",headers:{"x-tenant-id":tenant,"content-type":"application/json"},body:JSON.stringify({name:"API source",source_type:"FILE"})}));
  assert.equal(post.status,201); const source=await post.json(); assert.equal(source.tenant_id,tenant);
  const get=await router.handle(new Request("http://localhost/sources",{headers:{"x-tenant-id":tenant}}));
  assert.equal(get.status,200); assert.equal((await get.json()).length,1);
});

test("POST /ingestion/files creates private artifact and source file",async()=>{
  const source=r.list("sources")[0];

  const form=new FormData();
  form.append("source_id",source.id);
  form.append(
    "file",
    new Blob(["a,b\\n1,2\\n"],{type:"text/csv"}),
    "data.csv",
  );

  const res=await router.handle(
    new Request("http://localhost/ingestion/files",{
      method:"POST",
      headers:{
        "x-tenant-id":tenant,
        "Idempotency-Key":"pipeline-api-ingestion-v1",
      },
      body:form,
    }),
  );

  assert.equal(res.status,201);
  const body=await res.json();
  assert.equal(body.duplicate,false);
  assert.equal(body.artifact.storage_provider,"local-private");
});

test("pipeline read APIs remain tenant-scoped",async()=>{
  const source=r.list("sources")[0];
  const files=r.list("source_files");
  const res=await router.handle(new Request(`http://localhost/source-files`,{headers:{"x-tenant-id":tenant}}));
  assert.equal(res.status,200);
  assert.equal((await res.json()).length,files.length);
  const bad=await router.handle(new Request(`http://localhost/source-files`,{headers:{"x-tenant-id":"22222222-2222-4222-8222-222222222222"}}));
  assert.equal(bad.status,403);
  assert.equal((await bad.json()).error.code,"TENANT_ACCESS_ERROR");
});
