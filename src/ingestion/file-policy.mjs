export const FILE_POLICY = Object.freeze({
  maxBytes: 25 * 1024 * 1024, // [OBSERVÉ V5] compatibility baseline, not a final V6 limit.
  maxRawRecords: 10_000,       // [OBSERVÉ V5] compatibility baseline.
  allowed: Object.freeze({
    ".csv": ["text/csv", "application/csv", "application/octet-stream"],
    ".tsv": ["text/tab-separated-values", "text/tsv", "application/octet-stream"],
    ".json": ["application/json", "text/json", "application/octet-stream"],
    ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"],
    ".xlsm": ["application/vnd.ms-excel.sheet.macroEnabled.12", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"],
    ".pdf": ["application/pdf", "application/octet-stream"],
  }),
});

export function extensionOf(name) {
  const dot = String(name).lastIndexOf(".");
  return dot >= 0 ? String(name).slice(dot).toLowerCase() : "";
}

export function validateFileMetadata({ name, sizeBytes, mimeType }) {
  const extension = extensionOf(name);
  if (!FILE_POLICY.allowed[extension]) throw new Error(`Unsupported file extension: ${extension || "(none)"}`);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > FILE_POLICY.maxBytes) {
    throw new Error("File exceeds configured size limit");
  }
  if (typeof mimeType !== "string" || !mimeType) throw new Error("MIME type is required");
  const allowed = FILE_POLICY.allowed[extension];
  if (!allowed.includes(mimeType) && mimeType !== "application/octet-stream") {
    throw new Error(`MIME type does not match extension: ${mimeType}`);
  }
  return { extension };
}
