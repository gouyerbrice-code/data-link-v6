const DOMAIN_PATTERNS = {
  ARTICLE: [/article|sku|reference|designation|barcode|ean/i],
  CUSTOMER: [/client|customer|siren|siret|vat/i],
  SUPPLIER: [/supplier|fournisseur|siren|siret/i],
};
export function profileRows(rows){
  const columns=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  const stats=Object.fromEntries(columns.map(c=>{
    const vals=rows.map(r=>r[c]).filter(v=>v!==null&&v!=="");
    return [c,{non_null:vals.length,null_rate:rows.length?1-vals.length/rows.length:0,distinct:new Set(vals.map(String)).size,examples:vals.slice(0,3)}];
  }));
  const scores={ARTICLE:0,CUSTOMER:0,SUPPLIER:0};
  for(const c of columns)for(const [d,pats] of Object.entries(DOMAIN_PATTERNS))if(pats.some(p=>p.test(c)))scores[d]++;
  const ordered=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  const top=ordered[0], second=ordered[1];
  let domain="UNKNOWN",confidence="LOW";
  if(top[1]>=2 && top[1]>second[1]){domain=top[0];confidence=top[1]>=3?"HIGH":"MEDIUM";}
  return {domain,confidence,row_count:rows.length,column_count:columns.length,columns,statistics:stats,candidates:scores};
}
