import { randomUUID } from "node:crypto";

export function createRequestContext(headers = {}, now = new Date()) {
  const supplied = headers["x-request-id"] ?? headers["x-correlation-id"];
  const requestId = supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : randomUUID();

  return Object.freeze({
    request_id: requestId,
    correlation_id: requestId,
    created_at: now.toISOString(),
  });
}
