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
  supabase = null,
  identityService = null,
  resolveAuthenticatedUser = null,
} = {}) {
  const router = createRouter({
    config,
    logger,
    supabase,
    identityService,
    resolveAuthenticatedUser,
  });

  const server = createServer(async (req, res) => {
    const origin = `http://${req.headers.host ?? `${config.app.host}:${config.app.port}`}`;
    const request = new Request(`${origin}${req.url}`, {
      method: req.method,
      headers: req.headers,
    });
    const response = await router.handle(request);
    res.statusCode = response.status;
    for (const [key, value] of response.headers.entries()) res.setHeader(key, value);
    res.end(await response.text());
  });

  return server;
}
