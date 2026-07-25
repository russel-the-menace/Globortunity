import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NormalizedJobInput } from "@globortunity/domain";
import { connectDatabase, ensureSource, upsertJob, type Database } from "./index.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

integrationDescribe("database job identity", () => {
  let sql: Database;
  const suffix = randomUUID();
  const sourceA = `test-a-${suffix}`;
  const sourceB = `test-b-${suffix}`;

  beforeAll(async () => {
    sql = connectDatabase(databaseUrl);
    await ensureSource(sql, { id: sourceA, label: "Test A", baseUrl: null, enabled: true, policyStatus: "approved" });
    await ensureSource(sql, { id: sourceB, label: "Test B", baseUrl: null, enabled: true, policyStatus: "approved" });
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.begin(async (tx) => {
      await tx`DELETE FROM crawl_runs WHERE source_id IN (${sourceA}, ${sourceB})`;
      await tx`DELETE FROM job_sources WHERE source_id IN (${sourceA}, ${sourceB})`;
      await tx`DELETE FROM sources WHERE id IN (${sourceA}, ${sourceB})`;
      await tx`DELETE FROM jobs WHERE NOT EXISTS (SELECT 1 FROM job_sources WHERE job_id = jobs.id)`;
      await tx`DELETE FROM companies WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE company_id = companies.id)`;
    });
    await sql.end();
  });

  const job = (sourceId: string, description: string): NormalizedJobInput => ({
    sourceId,
    externalId: sourceId === sourceA ? "external-a" : "external-b",
    sourceUrl: `https://example.com/${sourceId}`,
    title: "Distributed Systems Engineer",
    companyName: `Integration Company ${suffix}`,
    location: "Remote",
    description,
    remoteScope: "remote",
    remoteConfidence: 0.99,
    employmentType: "full-time",
    salary: { min: null, max: null, currency: null, period: null, text: null },
    tags: ["PostgreSQL"],
    publishedAt: null,
    rawData: { test: true },
  });

  it("updates a sole occurrence, deduplicates exact matches, and splits a later divergence", async () => {
    const first = await upsertJob(sql, job(sourceA, "Initial description"));
    expect(first.created).toBe(true);

    const changedSoleOccurrence = await upsertJob(sql, job(sourceA, "Shared updated description"));
    expect(changedSoleOccurrence).toEqual({ jobId: first.jobId, created: false });

    const exactSecondSource = await upsertJob(sql, job(sourceB, "Shared updated description"));
    expect(exactSecondSource).toEqual({ jobId: first.jobId, created: false });

    const divergedFirstSource = await upsertJob(sql, job(sourceA, "Source A diverged description"));
    expect(divergedFirstSource.created).toBe(true);
    expect(divergedFirstSource.jobId).not.toBe(first.jobId);

    const occurrences = await sql`
      SELECT source_id AS "sourceId", job_id AS "jobId"
      FROM job_sources WHERE source_id IN (${sourceA}, ${sourceB}) ORDER BY source_id
    `;
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0]?.jobId).toBe(divergedFirstSource.jobId);
    expect(occurrences[1]?.jobId).toBe(first.jobId);
  });

  it("does not let collector defaults reopen an operator-paused source", async () => {
    await sql`UPDATE sources SET enabled = TRUE, policy_status = 'paused' WHERE id = ${sourceA}`;
    const effective = await ensureSource(sql, {
      id: sourceA,
      label: "Test A",
      baseUrl: null,
      enabled: true,
      policyStatus: "approved",
    });
    expect(effective).toEqual({ enabled: false, policyStatus: "paused" });
  });
});
