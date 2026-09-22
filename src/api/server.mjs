import { createServer } from "node:http";
import { loadConfig } from "../core/configuration.mjs";
import { createLogger } from "../core/logger.mjs";
import { createRouter } from "./router.mjs";

export function createHttpServer({
  config = loadConfig(),
  logger = createLogger({
    level: config.logging.level,
    environment: config.app.environment,
  }),
  identityService = null,
  resolveAuthenticatedUser = null,
  pipelineService = null,
  profileService = null,
  matchingService = null,
  executionService = null,
} = {}) {
  const router = createRouter({
    config,
    logger,
    identityService,
    resolveAuthenticatedUser,
    pipelineService,
    profileService,
    matchingService,
    executionService,
  });

  const server = createServer(async (req, res) => {
    try {
      const origin = `http://${req.headers.host ?? `${config.app.host}:${config.app.port}`}`;

      const body = await readRequestBody(req, config.ingestion?.maxBytes);

      const request = new Request(`${origin}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: body.length > 0 && req.method !== "GET" && req.method !== "HEAD"
          ? body
          : undefined,
        duplex: "half",
      });

      const response = await router.handle(request);

      res.statusCode = response.status;

      for (const [key, value] of response.headers.entries()) {
        res.setHeader(key, value);
      }

      res.end(await response.text());
    } catch (error) {
      logger.error("http.request_failed", {
        module: "api.server",
        error: error?.message,
      });

      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");

      res.end(JSON.stringify({
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error",
        },
      }));
    }
  });

  return server;
}

async function readRequestBody(req, maxBytes = 25 * 1024 * 1024) {
  if (req.method === "GET" || req.method === "HEAD") {
    return Buffer.alloc(0);
  }

  const contentLength = Number(req.headers["content-length"]);

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    const error = new Error("Request body exceeds configured size limit");
    error.status = 413;
    error.code = "FILE_TOO_LARGE";
    throw error;
  }

  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += part.length;

    if (total > maxBytes) {
      const error = new Error("Request body exceeds configured size limit");
      error.status = 413;
      error.code = "FILE_TOO_LARGE";
      throw error;
    }

    chunks.push(part);
  }

  return Buffer.concat(chunks);
}
