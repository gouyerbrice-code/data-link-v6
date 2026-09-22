import { VERSION } from "./version.mjs";

const ALLOWED_ENVIRONMENTS = new Set(["development", "test", "staging", "production"]);
const ALLOWED_LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);

function read(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function required(env, name) {
  const value = env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required configuration: ${name}`);
  }
  return value;
}

export function loadConfig(env = process.env) {
  const environment = env.NODE_ENV ?? "development";

  if (!ALLOWED_ENVIRONMENTS.has(environment)) {
    throw new Error(`Unsupported NODE_ENV: ${environment}`);
  }

  const logLevel = env.LOG_LEVEL ?? "info";

  if (!ALLOWED_LOG_LEVELS.has(logLevel)) {
    throw new Error(`Unsupported LOG_LEVEL: ${logLevel}`);
  }

  const config = {
    app: {
      name: read("APP_NAME", "data-link-v6"),
      environment,
      host: read("HOST", "127.0.0.1"),
      port: Number(read("PORT", "3000")),
    },

    version: VERSION,

    logging: {
      level: logLevel,
    },

    supabase: {
      url: env.SUPABASE_URL ?? null,
      anonKey: env.SUPABASE_PUBLISHABLE_KEY ?? null,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? null,
      secretKey: env.SUPABASE_SECRET_KEY ?? null,
    },

    featureFlags: {},
  };

  if (
    !Number.isInteger(config.app.port) ||
    config.app.port < 1 ||
    config.app.port > 65535
  ) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  if (environment !== "test") {
    required(env, "SUPABASE_URL");
    required(env, "SUPABASE_SECRET_KEY");
  }

  if (environment === "production") {
    required(env, "APP_NAME");
  }

  return Object.freeze(config);
}
