import { describe, expect, it } from "vitest";
import type { Database } from "@globortunity/database";
import { buildApp } from "./app.js";

describe("API", () => {
  it("reports process health without requiring a database query", async () => {
    const app = await buildApp({} as Database);
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", service: "globortunity-api" });
    await app.close();
  });

  it("preserves the rate limiter's 429 response", async () => {
    const app = await buildApp({} as Database, { rateLimitMax: 2 });
    await app.inject({ method: "GET", url: "/api/health" });
    await app.inject({ method: "GET", url: "/api/health" });
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "Rate limit exceeded" });
    await app.close();
  });

  it("uses the client address behind the two trusted proxy hops", async () => {
    const app = await buildApp({} as Database, { rateLimitMax: 1 });
    const first = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { "x-forwarded-for": "198.51.100.10, 10.0.1.2" },
    });
    const spoofedPrefix = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { "x-forwarded-for": "203.0.113.99, 198.51.100.10, 10.0.1.2" },
    });
    const otherClient = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { "x-forwarded-for": "198.51.100.11, 10.0.1.2" },
    });
    expect(first.statusCode).toBe(200);
    expect(spoofedPrefix.statusCode).toBe(429);
    expect(otherClient.statusCode).toBe(200);
    await app.close();
  });
});
