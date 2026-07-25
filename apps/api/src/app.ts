import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { getJob, getStats, listJobs, listSources, type Database } from "@globortunity/database";
import { remoteScopes, type JobSearchFilters } from "@globortunity/domain";
import { z } from "zod";

const searchSchema = z.object({
  query: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  source: z.string().trim().max(80).optional(),
  remoteScope: z.enum(remoteScopes).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function buildApp(sql: Database, options: { rateLimitMax?: number } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test"
      ? false
      : {
          level: process.env.LOG_LEVEL ?? "info",
          redact: ["req.headers.authorization", "req.headers.cookie"],
        },
    // Production traffic reaches the private API through Traefik and then Nginx.
    trustProxy: 2,
  });

  await app.register(cors, {
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim()),
  });
  await app.register(rateLimit, {
    max: options.rateLimitMax ?? Number(process.env.API_RATE_LIMIT_MAX ?? 180),
    timeWindow: "1 minute",
  });

  app.get("/api/health", async () => ({ status: "ok", service: "globortunity-api" }));

  app.get("/api/ready", async (_request, reply) => {
    try {
      await sql`SELECT 1`;
      return { status: "ready" };
    } catch (error) {
      app.log.error(error);
      return reply.code(503).send({ status: "not_ready" });
    }
  });

  app.get("/api/jobs", async (request, reply) => {
    const parsed = searchSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid search parameters", details: parsed.error.flatten().fieldErrors });
    }
    return listJobs(sql, parsed.data as JobSearchFilters);
  });

  app.get<{ Params: { id: string } }>("/api/jobs/:id", async (request, reply) => {
    const job = await getJob(sql, request.params.id);
    return job ?? reply.code(404).send({ error: "Job not found" });
  });

  app.get("/api/stats", async () => getStats(sql));
  app.get("/api/sources", async () => ({ items: await listSources(sql) }));

  app.setErrorHandler((error, _request, reply) => {
    const candidateStatus = (error as { statusCode?: unknown }).statusCode;
    const statusCode = typeof candidateStatus === "number" && candidateStatus >= 400 && candidateStatus < 500
      ? candidateStatus
      : 500;
    if (statusCode >= 500) app.log.error(error);
    reply.code(statusCode).send({
      error: statusCode === 429 ? "Rate limit exceeded" : statusCode === 500 ? "Internal server error" : "Request failed",
    });
  });

  return app;
}
