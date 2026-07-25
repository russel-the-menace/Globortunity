# Globortunity

Globortunity is a policy-aware remote-job collection and search platform. It separates source acquisition, normalization, storage, and the public React application so additional permitted feeds can be added without coupling them to the UI.

The runnable MVP includes:

- A React and Vite job browser with search, location, work-arrangement, and source filters.
- A Fastify REST API with validation, public rate limiting, health checks, and pagination.
- PostgreSQL storage with exact source identity, provenance, conservative fingerprints, and idempotent upserts.
- A lightweight collector process with source-level policy gates and crawl-run history.
- Docker Compose packaging, resource limits, CI, and automatic deployment from `main`.

## BOSS Zhipin Status

Live BOSS collection is intentionally disabled. The current BOSS user agreement prohibits acquiring platform information with spider, crawler, or simulated-user programs without permission, and its current robots rules disallow the query-based routes needed for job discovery. Globortunity does not bypass login, CAPTCHA, anti-bot systems, rate limits, private APIs, or other access controls.

The safe next step is written permission, an official/licensed feed, or another explicitly authorized access mechanism. See [the detailed BOSS source plan](docs/boss-source-plan.md).

## Architecture

```text
authorized source -> collector -> normalization -> PostgreSQL -> Fastify API -> React
```

The demo collector proves the end-to-end pipeline without contacting a recruitment website. BOSS has both a global and source-specific runtime gate, and no live transport is implemented.

More detail is in [the architecture document](docs/architecture.md).

## Local Development

Requirements: Node.js 22+, npm 10+, and Docker with Compose.

```bash
npm install
npm test
npm run build

cp .env.example .env
# Replace the example database password in .env before starting.
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.local.yaml up --build
```

Open `http://localhost:8080`. The web container proxies `/api` to the private API service. PostgreSQL is not published to the host.

For native development, run PostgreSQL first, set `DATABASE_URL`, apply migrations and seed data, then use `npm run dev`.

## Useful Commands

```bash
npm test              # Unit and API tests
npm run typecheck     # Type-check every workspace
npm run build         # Production builds
npm run db:migrate    # Apply ordered SQL migrations
npm run db:seed       # Idempotently load demo records
```

## Deployment

Every pull request and push to `main` runs tests and production builds. A verified `main` push builds versioned Linux images in GitHub Actions, transfers the release over a dedicated SSH key, and activates the Compose stack behind the server's existing Traefik proxy. Images are built on GitHub rather than the small production server.

The initial read-only demo is available at `http://47.109.60.123`. A dedicated registered subdomain is required before enabling the included TLS overlay or storing live-source data.

Production keeps PostgreSQL private and caps memory/CPU for every service. Browser automation is excluded from this server because its current 1.6 GiB RAM capacity is insufficient to run Chromium reliably beside Coolify and the existing application.

See [the deployment runbook](docs/deployment.md) for prerequisites, secrets, health checks, and rollback notes.

## Security

- Never commit `.env`, cookies, account credentials, proxy subscriptions, webhook URLs, or source payloads containing personal information.
- Keep `CRAWLING_ENABLED=false` and `BOSS_SOURCE_ENABLED=false` until an access review is approved and recorded.
- Rotate credentials that have been shared in chat or logs, and prefer dedicated SSH keys over root passwords.
- Treat a challenge, CAPTCHA, login redirect, `401`, repeated `403`, or `429` as a stop condition.

## License

[MIT](LICENSE)
