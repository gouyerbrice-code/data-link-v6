import { designationTokens, normalizeValue } from "./matcher.mjs";

const add = (map, key, value) => { if (!key) return; const bucket = map.get(key) ?? []; bucket.push(value); map.set(key, bucket); };
const valueFor = (entity, field) => entity?.normalized_payload?.[field] ?? entity?.identity_payload?.[field];

export function generateCandidates(leftEntities, rightEntities, { fields = {}, maxCandidates = 50, tokenFrequency = new Map() } = {}) {
  const f = { reference:"reference", barcode:"barcode", supplier_reference:"supplier_reference", designation:"designation", brand:"brand", ...fields };
  const indexes = { barcode:new Map(), reference:new Map(), supplier_reference:new Map(), brandDesignation:new Map(), designationToken:new Map() };
  for (const entity of rightEntities) {
    add(indexes.barcode, normalizeValue(valueFor(entity,f.barcode)), entity);
    add(indexes.reference, normalizeValue(valueFor(entity,f.reference)), entity);
    add(indexes.supplier_reference, normalizeValue(valueFor(entity,f.supplier_reference)), entity);
    const brand = normalizeValue(valueFor(entity,f.brand));
    for (const token of designationTokens(valueFor(entity,f.designation))) add(indexes.designationToken, token, entity);
    if (brand) for (const token of designationTokens(valueFor(entity,f.designation))) add(indexes.brandDesignation, brand + "\\0" + token, entity);
  }
  const result = [];
  for (const left of leftEntities) {
    const byId = new Map();
    const addPass = (entities, signal, priority, deterministic=false) => {
      for (const right of entities ?? []) if (right.id !== left.id) {
        const row = byId.get(right.id) ?? { left, right, rules:[], blocking_priority:priority, blocking_signal_count:0, deterministic:false };
        if (!row.rules.includes(signal)) { row.rules.push(signal); row.blocking_signal_count++; }
        row.blocking_priority = Math.max(row.blocking_priority, priority); row.deterministic ||= deterministic; byId.set(right.id,row);
      }
    };
    const exactBarcode = indexes.barcode.get(normalizeValue(valueFor(left,f.barcode))) ?? [];
    addPass(exactBarcode,"BARCODE_EXACT",100,true);
    addPass(indexes.reference.get(normalizeValue(valueFor(left,f.reference))) ?? [],"REFERENCE_EXACT",90,true);
    addPass(indexes.supplier_reference.get(normalizeValue(valueFor(left,f.supplier_reference))) ?? [],"SUPPLIER_REFERENCE_EXACT",85,true);
    const brand = normalizeValue(valueFor(left,f.brand));
    for (const token of designationTokens(valueFor(left,f.designation))) addPass(indexes.brandDesignation.get(brand + "\\0" + token) ?? [],"BRAND_DESIGNATION",60,false);
    for (const token of designationTokens(valueFor(left,f.designation))) {
      if ((tokenFrequency.get(token) ?? 0) <= 50) addPass(indexes.designationToken.get(token) ?? [],"DESIGNATION_TOKEN",40,false);
    }
    const rows=[...byId.values()].sort((a,b)=>b.blocking_priority-a.blocking_priority || b.blocking_signal_count-a.blocking_signal_count);
    const deterministic=rows.filter(x=>x.deterministic), secondary=rows.filter(x=>!x.deterministic).slice(0,Math.max(0,maxCandidates-deterministic.length));
    result.push(...deterministic,...secondary);
  }
  return result;
}
