export const NORMALIZATION_RULES = Object.freeze({
  trim: value => typeof value==="string" ? value.trim() : value,
  lowercase: value => typeof value==="string" ? value.toLowerCase() : value,
  uppercase: value => typeof value==="string" ? value.toUpperCase() : value,
  collapse_whitespace: value => typeof value==="string" ? value.replace(/\s+/g," ").trim() : value,
  strip_diacritics: value => typeof value==="string" ? value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"") : value,
  identifier_compact: value => typeof value==="string" ? value.replace(/[^A-Za-z0-9]/g,"").toUpperCase() : value,
});
export function normalizeValue(value,rules=[]){
  let v=value;
  for(const name of rules){if(!NORMALIZATION_RULES[name])throw new Error(`Unknown normalization rule: ${name}`);v=NORMALIZATION_RULES[name](v);}
  return v;
}
export function normalizePayload(payload,fieldRules={}){
  const out={};
  for(const [k,v] of Object.entries(payload)) out[k]=normalizeValue(v,fieldRules[k]??[]);
  return out;
}
