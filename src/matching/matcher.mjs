/** Deterministic V6-MATCH-2.3 scorer. Scores are explainable, not probabilities. */
export const MATCH_ENGINE_VERSION = "V6-MATCH-2.3";

const norm = (value) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const valueFor = (entity, field) => entity.normalized_payload?.[field] ?? entity.identity_payload?.[field];

export function scorePair(left, right, { referenceField = "reference", designationField = "designation" } = {}) {
  const reference = norm(valueFor(left, referenceField));
  const otherReference = norm(valueFor(right, referenceField));
  const designation = norm(valueFor(left, designationField));
  const otherDesignation = norm(valueFor(right, designationField));
  const signals = {
    reference_exact: Boolean(reference && reference === otherReference),
    designation_exact: Boolean(designation && designation === otherDesignation),
  };
  const score = (signals.reference_exact ? 100 : 0) + (signals.designation_exact ? 20 : 0);
  // Deliberately: a designation alone is never a strong/identical match.
  const decision = signals.reference_exact
    ? (signals.designation_exact ? "IDENTIQUE" : "MATCH_FORT")
    : (signals.designation_exact ? "A_CONTROLER" : "NO_MATCH");
  return { engine_version: MATCH_ENGINE_VERSION, score, decision, signals };
}
