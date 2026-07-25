# Deployment Runbook

## Production Shape

The production stack runs beside Coolify but remains an independent Compose project named `globortunity`:

- `web`: static React files in Nginx, attached to the existing `coolify` network.
- `api`: private Fastify service reached only through Nginx.
- `worker`: private, sequential collector with live crawling disabled.
- `postgres`: private PostgreSQL 16 volume.
- `migrate` and `seed`: idempotent one-shot release services.

Only the web container is routed by the existing Traefik proxy. No new host ports are published and the unrelated application is not changed.

## Audited Host Constraints

As reviewed on 2026-07-26, the host has 2 vCPU, about 1.6 GiB RAM, no swap, and roughly 30 GiB free disk. Coolify and the existing application already consume most memory headroom.

Consequences:

- Release images are built on GitHub Actions, not on the server.
- Every service has an explicit memory and CPU ceiling.
- Docker JSON logs rotate at 10 MiB with three files per service.
- The worker runs one source at a time.
- Browser automation is not deployed.
- A RAM upgrade to at least 4 GiB is required before considering Chromium.

The host's Mihomo proxy currently works, but a separately documented infrastructure issue leaves an unmanaged process holding its ports while the systemd instance failed to bind. Globortunity does not modify Mihomo. Repair it in a controlled maintenance window so Docker pulls and future source connectivity do not depend on an abandoned SSH scope.

## Production URL

Until a dedicated registered domain is supplied, the Compose labels route the read-only demo over the server IP:

```text
http://47.109.60.123
```

Alibaba's mainland edge rejects the unregistered `sslip.io` hostname, so it cannot complete ACME validation. Do not put credentials or live-source personal data on the temporary HTTP route. After a project-owned subdomain has DNS and any mainland-China filing requirements settled, set `APP_HOST`, `APP_PUBLIC_URL=https://...`, and `TLS_ENABLED=true`; the deployment script will add `compose.tls.yaml` for redirect and certificate issuance.

## Secret Locations

Server runtime values live in:

```text
/opt/globortunity/shared/.env
```

GitHub repository secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_KNOWN_HOSTS`

Never commit database credentials, private SSH keys, root passwords, proxy subscriptions, source cookies, or webhook tokens.

Required runtime posture:

```dotenv
NODE_ENV=production
APP_HOST=47.109.60.123
APP_PUBLIC_URL=http://47.109.60.123
TLS_ENABLED=false
CORS_ORIGIN=http://47.109.60.123
CRAWLING_ENABLED=false
BOSS_SOURCE_ENABLED=false
BOSS_AUTHORIZED_ACCESS=false
DEMO_SOURCE_ENABLED=true
```

`DATABASE_URL` and `POSTGRES_PASSWORD` must use one generated value and must not use the example password.

## Release Flow

The workflow in `.github/workflows/ci-deploy.yml` runs for pull requests and `main` pushes:

1. Install from `package-lock.json`.
2. Run all tests.
3. Build every workspace.
4. Build Linux API, worker, and web images on the GitHub runner and include the pinned PostgreSQL tag in the release archive.
5. Archive the exact Git commit and images.
6. Transfer both archives over the dedicated SSH key.
7. Extract to `/opt/globortunity/releases/<commit-sha>`.
8. Pass the server-owned `.env` explicitly with Compose `--env-file`; it is never copied into a release.
9. Load versioned images and run Compose with `--no-build`.
10. Wait for database, API, and web health checks.
11. Point `/opt/globortunity/current` at the healthy release.

The `current` and `previous` healthy releases retain their image archives; older and failed SHA releases are removed. If health checks fail after Compose begins replacing services, the deploy script reloads and reactivates `current` before reporting failure.

The existing app is not restarted or reconfigured.

## Manual Local Stack

```bash
cp .env.example .env
# Change POSTGRES_PASSWORD and update DATABASE_URL to match it.
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.local.yaml up --build
```

The local override publishes only Nginx on `http://localhost:8080`.

## Health Verification

After deployment:

```bash
docker compose -p globortunity -f infra/compose.yaml -f infra/compose.prod.yaml ps
curl -fsS http://47.109.60.123/healthz
curl -fsS http://47.109.60.123/api/ready
curl -fsS 'http://47.109.60.123/api/jobs?limit=1'
```

Also confirm the existing application remains healthy and compare `docker stats --no-stream` with its pre-deploy baseline.

## Persistence and Backups

PostgreSQL uses the Compose volume `globortunity_postgres_data`. Image rollback does not restore a database.

Before destructive migrations:

1. Create an encrypted backup outside this host.
2. Verify the backup artifact.
3. Prefer additive, backward-compatible schema changes.
4. Test restoration periodically.

Daily off-host backups are required before storing non-demo data.

## Rollback

Releases and versioned images remain available on the host. To reactivate a previous healthy release:

```bash
cd /opt/globortunity/releases/<previous-sha>
DEPLOY_TAG=<previous-sha> sh infra/remote-deploy.sh /path/to/the/retained-images.tar.gz
```

Retain at least the current and previous image archives if immediate rollback is required. If a schema migration is incompatible, application rollback alone is insufficient; assess database compatibility first.

## Host Security Follow-up

The root password shared during setup must be rotated. After verifying independent recovery access:

1. Disable root password SSH login.
2. Keep the deployment key on a dedicated user.
3. Restrict Coolify port 8000 to trusted source addresses.
4. Keep Mihomo 7890/9090 and the Traefik dashboard filtered from the internet.
5. Schedule operating-system security updates and add swap during a maintenance window.

These host-wide changes are not performed by the application deployment because they can affect the existing project.
