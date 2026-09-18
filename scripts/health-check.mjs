import { createHttpServer } from "../src/api/server.mjs";

const previousNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";

let server;

try {
  server = createHttpServer();

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });

  const { port } = server.address();

  for (const path of ["/health", "/ready"]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { "x-request-id": "p0-health-check" },
    });

    if (!response.ok) {
      throw new Error(`${path} returned HTTP ${response.status}`);
    }
  }

  console.log("Health check OK: /health and /ready.");
} finally {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnv;
  }
}
