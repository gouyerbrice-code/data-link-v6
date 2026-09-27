export async function exactFallback({ left, right, settings = {} }) {
  const fields = Array.isArray(settings.identity_fields) && settings.identity_fields.length
    ? settings.identity_fields
    : ["ean", "gtin", "barcode", "reference", "sku"];

  const rightIndex = new Map();
  for (const record of right) {
    for (const field of fields) {
      const value = record?.[field] ?? record?.normalized_payload?.[field];
      if (value == null || value === "") continue;
      rightIndex.set(field + "::" + String(value).trim().toUpperCase(), record);
    }
  }

  const pairs = [];
  for (const record of left) {
    for (const field of fields) {
      const value = record?.[field] ?? record?.normalized_payload?.[field];
      if (value == null || value === "") continue;
      const hit = rightIndex.get(field + "::" + String(value).trim().toUpperCase());
      if (hit) {
        pairs.push({
          left_id: String(record._datalink_id),
          right_id: String(hit._datalink_id),
          match_probability: 1,
          match_weight: null,
          cluster_id: null,
          method: "exact_identifier",
          field,
        });
        break;
      }
    }
  }

  return { engine: "fallback", pairs, statistics: { pairs: pairs.length, fields } };
}
