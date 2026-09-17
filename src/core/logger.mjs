const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "api_key",
  "authorization",
  "cookie",
]);

function sanitize(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : sanitize(item, seen);
  }
  return output;
}

export function createLogger({ level = "info", environment = "development", sink = console } = {}) {
  const levels = { debug: 10, info: 20, warn: 30, error: 40 };
  const threshold = levels[level] ?? levels.info;

  const log = (currentLevel, event, fields = {}) => {
    if ((levels[currentLevel] ?? 20) < threshold) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level: currentLevel,
      environment,
      event,
      ...sanitize(fields),
    };
    const line = JSON.stringify(entry);
    const method = currentLevel === "error" ? "error" : currentLevel === "warn" ? "warn" : "log";
    sink[method](line);
  };

  return {
    log,
    debug: (event, fields) => log("debug", event, fields),
    info: (event, fields) => log("info", event, fields),
    warn: (event, fields) => log("warn", event, fields),
    error: (event, fields) => log("error", event, fields),
  };
}
