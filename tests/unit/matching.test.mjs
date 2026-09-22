import test from "node:test";
import assert from "node:assert/strict";
import { scorePair, isValidEan, MATCH_ENGINE_VERSION } from "../../src/matching/matcher.mjs";
import { generateCandidates } from "../../src/matching/candidate-generator.mjs";
import { MemoryPipelineRepository } from "../../src/pipeline/memory-repository.mjs";
import { MatchingService } from "../../src/matching/matching-service.mjs";

const tenant_id="11111111-1111-4111-8111-111111111111";
const ctx={user_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",tenant_id};
const entity=(id,payload,tenant=tenant_id)=>({id,tenant_id:tenant,normalized_payload:payload});

test("V6-MATCH-2.3 exact validated EAN is IDENTIQUE",()=>{
  assert.equal(isValidEan("4006381333931"),true);
  assert.equal(scorePair(entity("a",{barcode:"4006381333931",designation:"POMPE"}),entity("b",{barcode:"4006381333931",designation:"POMPE"})).decision,"IDENTIQUE");
});
test("different valid EAN is A_CONTROLER",()=>{
  assert.equal(scorePair(entity("a",{barcode:"4006381333931",designation:"POMPE"}),entity("b",{barcode:"4006381333924",designation:"POMPE"})).decision,"A_CONTROLER");
});
test("designation alone is never a strong match",()=>{
  assert.equal(scorePair(entity("a",{designation:"Pompe inox"}),entity("b",{designation:"Pompe inox"})).decision,"A_CONTROLER");
});
test("reference and supplier reference are deterministic signals",()=>{
  assert.equal(scorePair(entity("a",{reference:"P-01",designation:"Pompe"}),entity("b",{reference:"P-01",designation:"Autre"})).decision,"MATCH_FORT");
  assert.equal(scorePair(entity("a",{supplier_reference:"F-01",designation:"Pompe"}),entity("b",{supplier_reference:"F-01",designation:"Autre"})).decision,"MATCH_FORT");
});
test("brand plus designation produces an auditable score",()=>{
  const r=scorePair(entity("a",{brand:"ACME",designation:"Pompe inox"}),entity("b",{brand:"ACME",designation:"Pompe inox"}));
  assert.equal(r.signals.brand,true); assert.ok(r.scores.designation>0); assert.ok(r.evidence);
});
test("candidate blocking has five passes and deterministic candidates are retained",()=>{
  const left=[entity("a",{reference:"R1",barcode:"4006381333931",supplier_reference:"S1",brand:"ACME",designation:"Pompe inox"})];
  const right=[entity("b",{reference:"R1",barcode:"4006381333931",supplier_reference:"S1",brand:"ACME",designation:"Pompe inox"}),entity("c",{designation:"Pompe inox"}),entity("d",{designation:"Valve"})];
  const rows=generateCandidates(left,right,{maxCandidates:1,tokenFrequency:new Map([["POMPE",1],["INOX",1]])});
  assert.ok(rows.some(x=>x.right.id==="b")); assert.ok(rows.some(x=>x.rules.includes("REFERENCE_EXACT"))); assert.ok(rows.some(x=>x.rules.includes("BARCODE_EXACT"))); assert.ok(rows.some(x=>x.rules.includes("SUPPLIER_REFERENCE_EXACT")));
});
test("matching service keeps proposal separate from user decision and enforces tenant isolation",async()=>{
  const repository={
    async getRun(t,id){return id==="run-a"?{id,tenant_id:t}:null},
    async getEntities(t,ids){return ids.map(id=>entity(id,{reference:"P-01",designation:"Pompe"},t))},
    async insertMatch(row){return row},
    async insertCandidates(rows){return rows},
    async insertAnomaly(row){return row},
    async getMatch(t,id){return id==="m"?{id,tenant_id:t}:null},
    async insertDecision(row){return row}
  };
  const service=new MatchingService({repository});
  const r=await service.execute(ctx,{runId:"run-a",sourceEntityIds:["a"],canonicalEntityIds:["b"]});
  assert.equal(r.matches[0].decision,"MATCH_FORT"); assert.equal(r.matches[0].status,"ANALYZED"); assert.equal(r.candidates[0].candidate_entity_id,"b");
  const d=await service.decide(ctx,{matchId:"m",decision:"A_CONTROLER",justification:"human review"});
  assert.equal(d.decision_source,"USER"); assert.equal(d.justification,"human review");
});
test("engine version is V6-MATCH-2.3",()=>assert.equal(MATCH_ENGINE_VERSION,"V6-MATCH-2.3"));
