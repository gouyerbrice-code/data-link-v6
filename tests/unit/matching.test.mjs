import test from "node:test";
import assert from "node:assert/strict";
import { scorePair, MATCH_ENGINE_VERSION } from "../../src/matching/matcher.mjs";
import { MemoryPipelineRepository } from "../../src/pipeline/memory-repository.mjs";
import { MatchingService } from "../../src/matching/matching-service.mjs";

const tenant_id="11111111-1111-4111-8111-111111111111";
const ctx={user_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",tenant_id};
const entity=(id,payload)=>({id,tenant_id,normalized_payload:payload});

test("designation alone is A_CONTROLER while an exact reference is MATCH_FORT",()=>{
  assert.equal(scorePair(entity("a",{designation:"Pompe"}),entity("b",{designation:"Pompe"})).decision,"A_CONTROLER");
  const result=scorePair(entity("a",{reference:" P-01 ",designation:"Pompe"}),entity("b",{reference:"P-01",designation:"Pompe alternative"}));
  assert.equal(result.decision,"MATCH_FORT");
  assert.equal(result.engine_version,MATCH_ENGINE_VERSION);
});

test("matching persists proposals separately from a human decision and isolates tenant data",()=>{
  const repository=new MemoryPipelineRepository();
  repository.insert("runs",{id:"run-a",tenant_id});
  repository.insert("entities",entity("pmm",{reference:"P-01",designation:"Pompe"}));
  repository.insert("entities",entity("pmb",{reference:"P-01",designation:"Pompe catalogue"}));
  const service=new MatchingService({repository});
  const result=service.execute(ctx,{runId:"run-a",sourceEntityIds:["pmm"],canonicalEntityIds:["pmb"]});
  assert.equal(result.candidates.length,1);
  assert.equal(result.matches[0].proposed_decision,"MATCH_FORT");
  assert.equal(repository.list("match_decisions").length,0);
  const decision=service.decide(ctx,{matchId:result.matches[0].id,decision:"A_CONTROLER",rationale:"review"});
  assert.equal(decision.decision,"A_CONTROLER");
  assert.equal(repository.list("matches")[0].proposed_decision,"MATCH_FORT");
});
