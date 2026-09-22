const norm = (value) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
export function generateCandidates(leftEntities, rightEntities, { referenceField = "reference", designationField = "designation" } = {}) {
  const byReference = new Map(), byDesignation = new Map();
  for (const entity of rightEntities) {
    const payload = entity.normalized_payload ?? {};
    for (const [map, field] of [[byReference, referenceField], [byDesignation, designationField]]) {
      const value = norm(payload[field]); if (value) (map.get(value) ?? map.set(value, []).get(value)).push(entity);
    }
  }
  const unique = new Map();
  for (const left of leftEntities) {
    const payload = left.normalized_payload ?? {};
    for (const [map, field] of [[byReference, referenceField], [byDesignation, designationField]]) {
      const value = norm(payload[field]); for (const right of (value ? map.get(value) ?? [] : [])) unique.set(`${left.id}:${right.id}`, { left, right });
    }
  }
  return [...unique.values()];
}
