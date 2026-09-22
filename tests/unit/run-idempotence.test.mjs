import test from "node:test";
import assert from "node:assert/strict";
import { MemoryPipelineRepository } from "../../src/pipeline/memory-repository.mjs";
import { RunService } from "../../src/runs/run-service.mjs";
import { VERSION } from "../../src/core/version.mjs";

const ctx={user_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",tenant_id:"11111111-1111-4111-8111-111111111111"};

test("RUN idempotency returns the same execution for the same key",()=>{
  const r=new MemoryPipelineRepository(), service=new RunService({repository:r,versions:VERSION});
  const a=service.create(ctx,{idempotency_key:"same-key",execution_id:"11111111-1111-4111-8111-111111111111"});
  const b=service.create(ctx,{idempotency_key:"same-key",execution_id:"22222222-2222-4222-8222-222222222222"});
  assert.equal(a.id,b.id);
  assert.equal(r.list("jobs").length,1);
  assert.equal(r.list("runs").length,1);
});

test("RUN step idempotency is unique within a run",()=>{
  const r=new MemoryPipelineRepository(), service=new RunService({repository:r,versions:VERSION});
  const run=service.create(ctx,{idempotency_key:"run-key"});
  service.step(ctx,run.id,{step_type:"RAW",sequence:1,idempotency_key:"raw-key"});
  const second=service.step(ctx,run.id,{step_type:"RAW",sequence:1,idempotency_key:"raw-key"});
  assert.equal(second.id, r.list("steps")[0].id);
});

test("RUN state machine accepts retry and rejects terminal regressions",()=>{
  const r=new MemoryPipelineRepository(), service=new RunService({repository:r,versions:VERSION});
  const run=service.create(ctx,{idempotency_key:"state-machine"});
  service.transition(ctx,run.id,"RUNNING");
  service.transition(ctx,run.id,"FAILED");
  const retried=service.transition(ctx,run.id,"RUNNING");
  assert.equal(retried.retry_count,1);
  const completed=service.transition(ctx,run.id,"COMPLETED");
  assert.equal(completed.status,"COMPLETED");
  assert.throws(()=>service.transition(ctx,run.id,"RUNNING"), /Invalid RUN transition/);
});

test("STEP state machine rejects completion before start and supports retry",()=>{
  const r=new MemoryPipelineRepository(), service=new RunService({repository:r,versions:VERSION});
  const run=service.create(ctx,{idempotency_key:"step-state-machine"});
  const step=service.step(ctx,run.id,{step_type:"RAW",sequence:1,idempotency_key:"raw"});
  assert.throws(()=>service.stepTransition(ctx,step.id,"COMPLETED"), /Invalid STEP transition/);
  service.stepTransition(ctx,step.id,"RUNNING");
  service.stepTransition(ctx,step.id,"FAILED");
  assert.equal(service.stepTransition(ctx,step.id,"RUNNING").status,"RUNNING");
});
