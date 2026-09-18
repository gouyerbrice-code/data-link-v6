import { createHttpServer } from "./api/server.mjs";
import { loadConfig } from "./core/configuration.mjs";
import { createLogger } from "./core/logger.mjs";
import { createSupabaseAdapter } from "./infrastructure/supabase/client.mjs";
import { IdentityRepository } from "./identity/repository/identity-repository.mjs";
import { IdentityService } from "./identity/service/identity-service.mjs";

const config = loadConfig();

const logger = createLogger({
  level: config.logging.level,
  environment: config.app.environment,
});

const supabase = createSupabaseAdapter({
  url: config.supabase.url,
  secretKey: config.supabase.secretKey,
});

const identityRepository = new IdentityRepository({ supabase });
const identityService = new IdentityService({
  repository: identityRepository,
});

const server = createHttpServer({
  config,
  logger,
  supabase,
  identityService,
  resolveAuthenticatedUser: (request) =>
    supabase.getUser(
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    ),
});

server.listen(config.app.port, config.app.host, () => {
  logger.info("runtime.started", {
    module: "runtime",
    service: config.app.name,
    host: config.app.host,
    port: config.app.port,
    product_version: config.version.product_version,
  });
});
