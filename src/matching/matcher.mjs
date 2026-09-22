/** DATA LINK V6 deterministic matcher. V6-MATCH-2.3. */
export const MATCH_ENGINE_VERSION = "V6-MATCH-2.3";
export const MATCHING_THRESHOLDS = Object.freeze({ candidate_designation: 0.72, match_fort: 0.75, identical: 0.90 });
export const MATCHING_WEIGHTS = Object.freeze({ reference: 0.10, barcode: 0.35, supplier_reference: 0.25, designation: 0.20, brand: 0.10 });
export const normalizeValue = (value) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
export const designationTokens = (value) => normalizeValue(value).split(/[^A-Z0-9À-ÖØ-Ý]+/u).filter((x) => x.length >= 2);
const valueFor = (entity, field) => entity?.normalized_payload?.[field] ?? entity?.identity_payload?.[field];
const missing = (value) => normalizeValue(value) === "";
export function isValidEan(value) {
  const ean = normalizeValue(value).replace(/\s+/g, "");
  if (!/^\d{8}$|^\d{12,14}$/.test(ean)) return false;
  const digits = ean.split("").map(Number); const check = digits.pop(); let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += digits[i] * weight;
  return (10 - (sum % 10)) % 10 === check;
}
export function similarity(a, b) {
  const left = normalizeValue(a), right = normalizeValue(b); if (!left || !right) return 0; if (left === right) return 1;
  const max = Math.max(left.length, right.length); const prev = Array.from({length:right.length + 1}, (_, i) => i);
  for (let i = 1; i <= left.length; i++) { const cur = [i]; for (let j = 1; j <= right.length; j++) cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)); for (let j = 0; j < cur.length; j++) prev[j] = cur[j]; }
  return 1 - prev[right.length] / max;
}
function tokenScore(a, b, tokenFrequency = new Map()) {
  const A = new Set(designationTokens(a)), B = new Set(designationTokens(b)); if (!A.size || !B.size) return 0;
  let inter = 0, weightA = 0, weightB = 0;
  for (const token of A) { const w = 1 / Math.max(1, tokenFrequency.get(token) ?? 1); weightA += w; if (B.has(token)) inter += w; }
  for (const token of B) weightB += 1 / Math.max(1, tokenFrequency.get(token) ?? 1);
  return inter / Math.max(1e-9, weightA + weightB - inter);
}
const exact = (a, b) => !missing(a) && !missing(b) && normalizeValue(a) === normalizeValue(b);
const comparableSimilarity = (a, b) => missing(a) || missing(b) ? null : similarity(a, b);
export function scorePair(left, right, { fields = {}, signalStats = {} } = {}) {
  const f = { reference:"reference", barcode:"barcode", supplier_reference:"supplier_reference", designation:"designation", brand:"brand", ...fields };
  const A = Object.fromEntries(Object.entries(f).map(([k, field]) => [k, valueFor(left, field)]));
  const B = Object.fromEntries(Object.entries(f).map(([k, field]) => [k, valueFor(right, field)]));
  const barcodeA = normalizeValue(A.barcode), barcodeB = normalizeValue(B.barcode);
  const validA = isValidEan(barcodeA), validB = isValidEan(barcodeB), barcodeExact = validA && validB && barcodeA === barcodeB, barcodeConflict = validA && validB && barcodeA !== barcodeB;
  const reference = exact(A.reference, B.reference), supplierReference = exact(A.supplier_reference, B.supplier_reference), brand = exact(A.brand, B.brand);
  const designation = tokenScore(A.designation, B.designation, signalStats.designationTokenFrequency ?? new Map());
  const signals = { reference, barcode_exact: barcodeExact, barcode_conflict: barcodeConflict, supplier_reference: supplierReference, designation_score: designation, brand, valid_barcode_a: validA, valid_barcode_b: validB };
  const scores = { reference: reference ? 1 : comparableSimilarity(A.reference, B.reference), barcode: barcodeExact ? 1 : (barcodeConflict ? 0 : (validA && validB ? 0 : null)), supplier_reference: supplierReference ? 1 : comparableSimilarity(A.supplier_reference, B.supplier_reference), designation, brand: brand ? 1 : comparableSimilarity(A.brand, B.brand) };
  const weighted = Object.entries(MATCHING_WEIGHTS).reduce((sum, [key, weight]) => sum + (scores[key] == null ? 0 : scores[key] * weight), 0);
  const available = Object.entries(MATCHING_WEIGHTS).reduce((sum, [key, weight]) => sum + (scores[key] == null ? 0 : weight), 0);
  const score = available ? weighted / available : 0;
  let decision = "NO_MATCH";
  if (barcodeConflict) decision = "A_CONTROLER";
  else if (barcodeExact && designation >= MATCHING_THRESHOLDS.candidate_designation) decision = "IDENTIQUE";
  else if ((reference || supplierReference) && designation >= MATCHING_THRESHOLDS.candidate_designation) decision = "MATCH_FORT";
  else if (score >= MATCHING_THRESHOLDS.identical && (reference || supplierReference || brand)) decision = "IDENTIQUE";
  else if (score >= MATCHING_THRESHOLDS.match_fort && (reference || supplierReference || brand)) decision = "MATCH_FORT";
  else if (score >= MATCHING_THRESHOLDS.candidate_designation || reference || supplierReference || brand) decision = "A_CONTROLER";
  const evidence = { fields: f, values: { left:A, right:B }, scores, weights:MATCHING_WEIGHTS, thresholds:MATCHING_THRESHOLDS, score, decision };
  return { engine_version:MATCH_ENGINE_VERSION, score, confidence:Math.min(1, Math.max(0, score)), decision, signals, scores, evidence };
}
