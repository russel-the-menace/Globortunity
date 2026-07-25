CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  base_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  policy_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (policy_status IN ('pending', 'approved', 'paused', 'blocked')),
  last_success_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  canonical_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  fingerprint TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  remote_scope TEXT NOT NULL
    CHECK (remote_scope IN ('remote', 'hybrid', 'onsite', 'unknown')),
  remote_confidence DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (remote_confidence >= 0 AND remote_confidence <= 1),
  employment_type TEXT NOT NULL
    CHECK (employment_type IN ('full-time', 'part-time', 'contract', 'internship', 'temporary', 'unknown')),
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT,
  salary_period TEXT CHECK (salary_period IN ('hour', 'month', 'year')),
  salary_text TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_sources (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id),
  external_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  missing_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, external_id)
);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
  pages_requested INTEGER NOT NULL DEFAULT 0,
  jobs_seen INTEGER NOT NULL DEFAULT 0,
  jobs_created INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS jobs_active_published_idx
  ON jobs (active, published_at DESC NULLS LAST, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS jobs_remote_scope_idx ON jobs (remote_scope) WHERE active;
CREATE INDEX IF NOT EXISTS jobs_location_lower_idx ON jobs (LOWER(location));
CREATE INDEX IF NOT EXISTS job_sources_job_idx ON job_sources (job_id);
CREATE INDEX IF NOT EXISTS job_sources_source_active_idx ON job_sources (source_id, active);
CREATE INDEX IF NOT EXISTS crawl_runs_source_started_idx ON crawl_runs (source_id, started_at DESC);
