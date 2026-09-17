import { createHttpServer } from "./api/server.mjs";
import { loadConfig } from "./core/configuration.mjs";
import { createLogger } from "./core/logger.mjs";

const config = loadConfig();
const logger = createLogger({
  level: config.logging.level,
  environment: config.app.environment,
});

const server = createHttpServer({ config, logger });

server.listen(config.app.port, config.app.host, () => {
  logger.info("runtime.started", {
    module: "runtime",
    service: config.app.name,
    host: config.app.host,
    port: config.app.port,
    product_version: config.version.product_version,
  });
});
