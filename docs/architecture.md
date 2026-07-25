# Globortunity Architecture

## Purpose

Globortunity collects job listings only through permitted source mechanisms, normalizes them into a source-neutral model, stores provenance in PostgreSQL, and exposes the result through a React application.

The product is "real-time-ish": a source without an authorized push feed can only be polled at a reviewed interval. The UI reports observed freshness rather than promising instant delivery.

## Implemented MVP

| Area | Choice | Reason |
| --- | --- | --- |
| Repository | TypeScript npm workspaces | One runtime and shared server-side domain rules |
| Web | React, Vite, Lucide | Small, responsive job-search application |
| API | Fastify, Zod | Lean REST API with runtime validation and rate limiting |
| Storage | PostgreSQL | Jobs, provenance, deduplication, and crawl history in one durable store |
| Collection | Separate Node worker | Source traffic cannot be triggered by public API requests |
| Scheduling | One sequential interval loop | Fits the current server and guarantees source concurrency of one |
| Delivery | Docker Compose, Traefik, GitHub Actions | Isolated services and tested push-to-main releases |

Redis and browser automation are deliberately absent from the MVP. The current server has only 1.6 GiB RAM and no swap. PostgreSQL-backed state plus one worker is enough until permitted source volume demonstrates a queue is necessary.

## Data Flow

```text
permitted source
      |
      v
policy gate -> source collector -> normalized job -> transactional upsert
                                                   |
                                                   v
                                             PostgreSQL
                                                   |
                                                   v
React browser <- Nginx /api proxy <- Fastify read API
```

The API never initiates collection. The public application cannot enable a source or change a policy decision.

## Workspace Boundaries

```text
apps/web       React browser and display-only source attribution
apps/api       Public read API, validation, health, and rate limiting
apps/worker    Collector interfaces, policy gates, and sequential runner
packages/domain      Normalization, salary parsing, remote classification, fingerprinting
packages/database    SQL access, migrations, demo records, and idempotent upserts
infra          Compose files, Nginx, migrations, and deployment scripts
```

Source-specific parsing and transport stay in the worker. Domain and database packages contain no BOSS HTTP logic.

## Storage Model

- `sources` holds the source label, enablement, policy status, and last successful run.
- `companies` holds a normalized company key and display name.
- `jobs` holds the canonical searchable job fields and conservative fingerprint.
- `job_sources` holds exact `(source_id, external_id)` identity, source URL, raw structured data, and first/last-seen timestamps.
- `crawl_runs` records status, counts, timing, and a bounded error or skip reason.
- `schema_migrations` records applied ordered SQL files.

PostgreSQL is the system of record. Source records and canonical jobs are separated so one job can retain multiple proven origins.

## Identity and Deduplication

Deduplication is deliberately conservative:

1. `(source_id, external_id)` is the exact idempotency key.
2. A SHA-256 fingerprint covers normalized company, title, location, remote scope, and a bounded description signature.
3. Only an exact fingerprint links two occurrences in the MVP.
4. Uncertain matches stay separate because a false merge is worse than a visible duplicate.

When a source record changes to a different exact fingerprint, its occurrence is relinked transactionally. An old canonical job is removed only if it has no remaining source occurrence.

## Remote Classification

The model stores:

- `remote_scope`: `remote`, `hybrid`, `onsite`, or `unknown`.
- `remote_confidence`: a value from `0` to `1`.
- Source text and normalized fields needed to audit the decision.

Explicit negative phrases such as "not on-site" or "does not accept remote" take precedence over incidental remote keywords. Missing evidence remains `unknown`.

## Collector Contract

Every collector exposes source policy metadata and returns a bounded result. The runner:

1. Upserts the source policy state.
2. Starts a `crawl_run`.
3. Calls one collector at a time.
4. Transactionally upserts each normalized job.
5. Records succeeded, failed, or skipped status plus counts.

A `paused` or `blocked` database policy state takes precedence over collector configuration and forces `enabled=false`. This is the persistent operator kill switch. Environment flags can disable a source but cannot silently reopen a database-paused source.

The demo collector proves this path without third-party traffic. The BOSS collector currently makes zero network requests. It requires `CRAWLING_ENABLED=true`, `BOSS_SOURCE_ENABLED=true`, and an authorization flag, but even all three flags only reach a second hard stop because no permitted transport is implemented.

Any future live adapter must implement the controls in [boss-source-plan.md](boss-source-plan.md) before transport code is accepted.

Automatic job closure is deliberately not implemented in the MVP. A later authorized collector must distinguish complete from partial runs and require repeated complete absences or an explicit unavailable response before incrementing `missing_count` or closing a listing.

## API Contract

- `GET /api/health` checks the API process.
- `GET /api/ready` checks PostgreSQL.
- `GET /api/jobs` supports bounded page, keyword, location, source, and remote-scope filters.
- `GET /api/jobs/:id` returns one active canonical job.
- `GET /api/stats` returns active/remote/source counts and freshness.
- `GET /api/sources` returns public source policy status without secrets.

The API limits request rate and page size. Raw source payloads, cookies, proxy settings, collector controls, and internal stack traces are never returned.

## Runtime Resources

Production limits are sized for the audited host:

- PostgreSQL: 160 MiB with 32 MiB shared buffers and 30 connections.
- API: 128 MiB.
- Worker: 96 MiB, one sequential run.
- Nginx web: 48 MiB.

These are ceilings, not capacity guarantees. Chromium/Playwright must not be added to this host without upgrading it to at least 4 GiB RAM and reassessing the existing workload.

## Security Boundaries

- PostgreSQL, API, and worker have no host-published ports.
- Only Nginx joins the existing `coolify` network and receives Traefik traffic.
- Production secrets exist only in `/opt/globortunity/shared/.env` and GitHub Actions secrets.
- Logs redact authorization and cookie headers and must not contain source credentials or response bodies.
- Source enablement fails closed.
- Deployment uses a dedicated SSH key instead of the shared root password.

## Evolution Path

Add a queue only when approved sources or runtime measurements require independent retries and backpressure. Add a search index only when PostgreSQL filtering is measurably insufficient. Add a rendered-page collector only when source authorization requires it and suitable isolated compute is available.
