export const ERROR_CODES = Object.freeze({
  AUTHENTICATION_ERROR: "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR: "AUTHORIZATION_ERROR",
  TENANT_ACCESS_ERROR: "TENANT_ACCESS_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  IDEMPOTENCY_ERROR: "IDEMPOTENCY_ERROR",
  INGESTION_ERROR: "INGESTION_ERROR",
  PROCESSING_ERROR: "PROCESSING_ERROR",
  ENGINE_ERROR: "ENGINE_ERROR",
  EXTERNAL_PROVIDER_ERROR: "EXTERNAL_PROVIDER_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
});

export class DataLinkError extends Error {
  constructor(code, message, { status = 500, details = undefined, cause = undefined } = {}) {
    super(message, { cause });
    this.name = "DataLinkError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function errorPayload(error, requestId) {
  const known = error instanceof DataLinkError;
  return {
    error: {
      code: known ? error.code : ERROR_CODES.INTERNAL_ERROR,
      message: known ? error.message : "Internal server error",
      ...(known && error.details !== undefined ? { details: error.details } : {}),
      request_id: requestId,
    },
  };
}
