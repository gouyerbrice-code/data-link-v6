export const MATCHING_ENGINE_MODES = Object.freeze({
  SPLINK: "splink",
  FALLBACK: "fallback",
  SHADOW: "shadow",
});

export function normalizeMatchingInput(records = []) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  return records.map((record, index) => ({
    ...record,
    _datalink_id: record?._datalink_id ?? record?.id ?? String(index),
  }));
}
