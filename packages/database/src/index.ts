import { randomUUID } from "node:crypto";
import postgres from "postgres";
import {
  createJobFingerprint,
  normalizeKey,
  type JobSearchFilters,
  type JobView,
  type NormalizedJobInput,
} from "@globortunity/domain";

export type Database = ReturnType<typeof postgres>;

export function connectDatabase(databaseUrl = process.env.DATABASE_URL): Database {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return postgres(databaseUrl, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    transform: { undefined: null },
  });
}

export async function ensureSource(
  sql: Database,
  source: { id: string; label: string; baseUrl: string | null; enabled: boolean; policyStatus: "pending" | "approved" | "paused" | "blocked" },
): Promise<{ enabled: boolean; policyStatus: "pending" | "approved" | "paused" | "blocked" }> {
  const rows = (await sql`
    INSERT INTO sources (id, label, base_url, enabled, policy_status)
    VALUES (${source.id}, ${source.label}, ${source.baseUrl}, ${source.enabled && source.policyStatus === "approved"}, ${source.policyStatus})
    ON CONFLICT (id) DO UPDATE SET
      label = EXCLUDED.label,
      base_url = EXCLUDED.base_url,
      enabled = CASE
        WHEN sources.policy_status IN ('paused', 'blocked') OR EXCLUDED.policy_status <> 'approved' THEN FALSE
        ELSE EXCLUDED.enabled
      END,
      policy_status = CASE
        WHEN sources.policy_status IN ('paused', 'blocked') THEN sources.policy_status
        ELSE EXCLUDED.policy_status
      END,
      updated_at = NOW()
    RETURNING enabled, policy_status AS "policyStatus"
  `) as unknown as Array<{ enabled: boolean; policyStatus: "pending" | "approved" | "paused" | "blocked" }>;
  const effective = rows[0];
  if (!effective) throw new Error("Source upsert did not return its effective policy state");
  return effective;
}

export async function upsertJob(sql: Database, input: NormalizedJobInput): Promise<{ jobId: string; created: boolean }> {
  const fingerprint = createJobFingerprint(input);
  const companyKey = normalizeKey(input.companyName);

  return sql.begin(async (tx) => {
    const companyRows = (await tx`
      INSERT INTO companies (id, canonical_name, canonical_key)
      VALUES (${randomUUID()}, ${input.companyName}, ${companyKey})
      ON CONFLICT (canonical_key) DO UPDATE SET
        canonical_name = EXCLUDED.canonical_name,
        updated_at = NOW()
      RETURNING id
    `) as unknown as Array<{ id: string }>;
    const companyId = companyRows[0]?.id;
    if (!companyId) throw new Error("Company upsert did not return an id");

    const existingRows = (await tx`
      SELECT
        js.job_id AS "jobId",
        j.fingerprint,
        (SELECT COUNT(*)::int FROM job_sources all_sources WHERE all_sources.job_id = js.job_id) AS "sourceCount"
      FROM job_sources js
      JOIN jobs j ON j.id = js.job_id
      WHERE js.source_id = ${input.sourceId} AND js.external_id = ${input.externalId}
      LIMIT 1
    `) as unknown as Array<{ jobId: string; fingerprint: string; sourceCount: number }>;

    const matchingRows = (await tx`
      SELECT id FROM jobs WHERE fingerprint = ${fingerprint} LIMIT 1
    `) as unknown as Array<{ id: string }>;
    const matchingId = matchingRows[0]?.id;
    const existing = existingRows[0];
    let jobId: string;
    let created = false;
    if (matchingId) {
      jobId = matchingId;
    } else if (existing && (existing.fingerprint === fingerprint || existing.sourceCount === 1)) {
      jobId = existing.jobId;
    } else {
      jobId = randomUUID();
      created = true;
    }

    await tx`
      INSERT INTO jobs (
        id, company_id, fingerprint, title, location, description, remote_scope,
        remote_confidence, employment_type, salary_min, salary_max, salary_currency,
        salary_period, salary_text, tags, published_at
      ) VALUES (
        ${jobId}, ${companyId}, ${fingerprint}, ${input.title}, ${input.location},
        ${input.description}, ${input.remoteScope}, ${input.remoteConfidence},
        ${input.employmentType}, ${input.salary.min}, ${input.salary.max},
        ${input.salary.currency}, ${input.salary.period}, ${input.salary.text},
        ${input.tags}, ${input.publishedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        company_id = EXCLUDED.company_id,
        fingerprint = EXCLUDED.fingerprint,
        title = EXCLUDED.title,
        location = EXCLUDED.location,
        description = EXCLUDED.description,
        remote_scope = EXCLUDED.remote_scope,
        remote_confidence = EXCLUDED.remote_confidence,
        employment_type = EXCLUDED.employment_type,
        salary_min = EXCLUDED.salary_min,
        salary_max = EXCLUDED.salary_max,
        salary_currency = EXCLUDED.salary_currency,
        salary_period = EXCLUDED.salary_period,
        salary_text = EXCLUDED.salary_text,
        tags = EXCLUDED.tags,
        published_at = COALESCE(EXCLUDED.published_at, jobs.published_at),
        last_seen_at = NOW(),
        active = TRUE,
        updated_at = NOW()
    `;

    await tx`
      INSERT INTO job_sources (
        id, job_id, source_id, external_id, source_url, raw_data
      ) VALUES (
        ${randomUUID()}, ${jobId}, ${input.sourceId}, ${input.externalId},
        ${input.sourceUrl}, ${tx.json(input.rawData as postgres.JSONValue)}
      )
      ON CONFLICT (source_id, external_id) DO UPDATE SET
        job_id = EXCLUDED.job_id,
        source_url = EXCLUDED.source_url,
        raw_data = EXCLUDED.raw_data,
        last_seen_at = NOW(),
        missing_count = 0,
        active = TRUE,
        updated_at = NOW()
    `;

    if (existing && existing.jobId !== jobId) {
      await tx`
        DELETE FROM jobs old_job
        WHERE old_job.id = ${existing.jobId}
          AND NOT EXISTS (SELECT 1 FROM job_sources WHERE job_id = old_job.id)
      `;
    }

    return { jobId, created };
  });
}

interface JobRow {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  remoteScope: JobView["remoteScope"];
  remoteConfidence: number;
  employmentType: JobView["employmentType"];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: JobView["salary"]["period"];
  salaryText: string | null;
  tags: string[];
  publishedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  sources: Array<{ id: string; label: string; url: string; lastSeenAt: string }>;
}

function toJobView(row: JobRow): JobView {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    description: row.description,
    remoteScope: row.remoteScope,
    remoteConfidence: row.remoteConfidence,
    employmentType: row.employmentType,
    salary: {
      min: row.salaryMin,
      max: row.salaryMax,
      currency: row.salaryCurrency,
      period: row.salaryPeriod,
      text: row.salaryText,
    },
    tags: row.tags,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    sources: row.sources,
  };
}

export async function listJobs(
  sql: Database,
  filters: JobSearchFilters,
): Promise<{ items: JobView[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
  const offset = (page - 1) * limit;
  const query = filters.query?.trim() ? `%${filters.query.trim()}%` : null;
  const location = filters.location?.trim() ? `%${filters.location.trim()}%` : null;
  const source = filters.source?.trim() || null;
  const scope = filters.remoteScope ?? null;

  const rows = (await sql`
    SELECT
      j.id,
      j.title,
      c.canonical_name AS company,
      j.location,
      j.description,
      j.remote_scope AS "remoteScope",
      j.remote_confidence AS "remoteConfidence",
      j.employment_type AS "employmentType",
      j.salary_min AS "salaryMin",
      j.salary_max AS "salaryMax",
      j.salary_currency AS "salaryCurrency",
      j.salary_period AS "salaryPeriod",
      j.salary_text AS "salaryText",
      j.tags,
      j.published_at AS "publishedAt",
      j.first_seen_at AS "firstSeenAt",
      j.last_seen_at AS "lastSeenAt",
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'label', s.label,
            'url', js.source_url,
            'lastSeenAt', js.last_seen_at
          ) ORDER BY js.last_seen_at DESC
        ) FILTER (WHERE js.id IS NOT NULL),
        '[]'::jsonb
      ) AS sources
    FROM jobs j
    JOIN companies c ON c.id = j.company_id
    JOIN job_sources js ON js.job_id = j.id AND js.active
    JOIN sources s ON s.id = js.source_id
    WHERE j.active
      AND (${query}::text IS NULL OR j.title ILIKE ${query} OR c.canonical_name ILIKE ${query} OR j.description ILIKE ${query})
      AND (${location}::text IS NULL OR j.location ILIKE ${location})
      AND (${scope}::text IS NULL OR j.remote_scope = ${scope})
      AND (${source}::text IS NULL OR EXISTS (
        SELECT 1 FROM job_sources source_filter
        WHERE source_filter.job_id = j.id AND source_filter.source_id = ${source} AND source_filter.active
      ))
    GROUP BY j.id, c.canonical_name
    ORDER BY j.published_at DESC NULLS LAST, j.last_seen_at DESC, j.id
    LIMIT ${limit} OFFSET ${offset}
  `) as unknown as JobRow[];

  const countRows = (await sql`
    SELECT COUNT(DISTINCT j.id)::int AS count
    FROM jobs j
    JOIN companies c ON c.id = j.company_id
    JOIN job_sources js ON js.job_id = j.id AND js.active
    WHERE j.active
      AND (${query}::text IS NULL OR j.title ILIKE ${query} OR c.canonical_name ILIKE ${query} OR j.description ILIKE ${query})
      AND (${location}::text IS NULL OR j.location ILIKE ${location})
      AND (${scope}::text IS NULL OR j.remote_scope = ${scope})
      AND (${source}::text IS NULL OR EXISTS (
        SELECT 1 FROM job_sources source_filter
        WHERE source_filter.job_id = j.id AND source_filter.source_id = ${source} AND source_filter.active
      ))
  `) as unknown as Array<{ count: number }>;

  return { items: rows.map(toJobView), total: countRows[0]?.count ?? 0, page, limit };
}

export async function getJob(sql: Database, id: string): Promise<JobView | null> {
  const result = await listJobs(sql, { limit: 50 });
  const inFirstPage = result.items.find((item) => item.id === id);
  if (inFirstPage) return inFirstPage;

  const rows = (await sql`
    SELECT
      j.id, j.title, c.canonical_name AS company, j.location, j.description,
      j.remote_scope AS "remoteScope", j.remote_confidence AS "remoteConfidence",
      j.employment_type AS "employmentType", j.salary_min AS "salaryMin",
      j.salary_max AS "salaryMax", j.salary_currency AS "salaryCurrency",
      j.salary_period AS "salaryPeriod", j.salary_text AS "salaryText", j.tags,
      j.published_at AS "publishedAt", j.first_seen_at AS "firstSeenAt",
      j.last_seen_at AS "lastSeenAt",
      jsonb_agg(jsonb_build_object(
        'id', s.id, 'label', s.label, 'url', js.source_url, 'lastSeenAt', js.last_seen_at
      ) ORDER BY js.last_seen_at DESC) AS sources
    FROM jobs j
    JOIN companies c ON c.id = j.company_id
    JOIN job_sources js ON js.job_id = j.id AND js.active
    JOIN sources s ON s.id = js.source_id
    WHERE j.id = ${id} AND j.active
    GROUP BY j.id, c.canonical_name
  `) as unknown as JobRow[];
  return rows[0] ? toJobView(rows[0]) : null;
}

export async function getStats(sql: Database): Promise<{ activeJobs: number; remoteJobs: number; sources: number; lastUpdatedAt: string | null }> {
  const rows = (await sql`
    SELECT
      COUNT(DISTINCT j.id)::int AS "activeJobs",
      COUNT(DISTINCT j.id) FILTER (WHERE j.remote_scope = 'remote')::int AS "remoteJobs",
      COUNT(DISTINCT js.source_id)::int AS sources,
      MAX(j.last_seen_at) AS "lastUpdatedAt"
    FROM jobs j
    LEFT JOIN job_sources js ON js.job_id = j.id AND js.active
    WHERE j.active
  `) as unknown as Array<{ activeJobs: number; remoteJobs: number; sources: number; lastUpdatedAt: Date | null }>;
  const row = rows[0];
  return {
    activeJobs: row?.activeJobs ?? 0,
    remoteJobs: row?.remoteJobs ?? 0,
    sources: row?.sources ?? 0,
    lastUpdatedAt: row?.lastUpdatedAt?.toISOString() ?? null,
  };
}

export async function listSources(sql: Database): Promise<Array<{ id: string; label: string; enabled: boolean; policyStatus: string; lastSuccessAt: string | null }>> {
  const rows = (await sql`
    SELECT id, label, enabled, policy_status AS "policyStatus", last_success_at AS "lastSuccessAt"
    FROM sources ORDER BY label
  `) as unknown as Array<{ id: string; label: string; enabled: boolean; policyStatus: string; lastSuccessAt: Date | null }>;
  return rows.map((row) => ({ ...row, lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null }));
}

export async function startCrawlRun(sql: Database, sourceId: string): Promise<string> {
  const id = randomUUID();
  await sql`INSERT INTO crawl_runs (id, source_id, status) VALUES (${id}, ${sourceId}, 'running')`;
  return id;
}

export async function finishCrawlRun(
  sql: Database,
  id: string,
  result: { status: "succeeded" | "failed" | "skipped"; pagesRequested: number; jobsSeen: number; jobsCreated: number; errorSummary?: string },
): Promise<void> {
  await sql`
    UPDATE crawl_runs SET
      status = ${result.status}, pages_requested = ${result.pagesRequested},
      jobs_seen = ${result.jobsSeen}, jobs_created = ${result.jobsCreated},
      error_summary = ${result.errorSummary ?? null}, finished_at = NOW()
    WHERE id = ${id}
  `;
  if (result.status === "succeeded") {
    await sql`
      UPDATE sources SET last_success_at = NOW(), updated_at = NOW()
      WHERE id = (SELECT source_id FROM crawl_runs WHERE id = ${id})
    `;
  }
}
