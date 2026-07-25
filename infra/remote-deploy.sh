#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: remote-deploy.sh <images.tar.gz>" >&2
  exit 64
fi

if [ "${GLOBORTUNITY_LOCK_HELD:-0}" != "1" ]; then
  exec flock -w 300 /opt/globortunity/deploy.lock \
    env GLOBORTUNITY_LOCK_HELD=1 \
      DEPLOY_TAG="${DEPLOY_TAG:-dev}" \
      GLOBORTUNITY_ENV_FILE="${GLOBORTUNITY_ENV_FILE:-/opt/globortunity/shared/.env}" \
      sh "$0" "$@"
fi

image_archive=$1
test -f "$image_archive"
release_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
env_file=${GLOBORTUNITY_ENV_FILE:-/opt/globortunity/shared/.env}
test -f "$env_file"
set -a
# The server-owned file is a shell-compatible dotenv file with restricted permissions.
. "$env_file"
set +a
APP_HOST=${APP_HOST:-47.109.60.123}
APP_PUBLIC_URL=${APP_PUBLIC_URL:-http://${APP_HOST}}
TLS_ENABLED=${TLS_ENABLED:-false}
gzip -dc "$image_archive" | docker load

compose() {
  if [ "$TLS_ENABLED" = "true" ]; then
    docker compose \
      --project-name globortunity \
      --env-file "$env_file" \
      --file "$release_root/infra/compose.yaml" \
      --file "$release_root/infra/compose.prod.yaml" \
      --file "$release_root/infra/compose.tls.yaml" \
      "$@"
  else
    docker compose \
      --project-name globortunity \
      --env-file "$env_file" \
      --file "$release_root/infra/compose.yaml" \
      --file "$release_root/infra/compose.prod.yaml" \
      "$@"
  fi
}

activate() {
  compose up --detach --no-build --pull never --remove-orphans --wait --wait-timeout 120 || return 1

  web_container=$(compose ps -q web)
  api_container=$(compose ps -q api)
  worker_container=$(compose ps -q worker)
  test -n "$web_container" && test -n "$api_container" && test -n "$worker_container" || return 1
  test "$(docker inspect --format '{{.State.Health.Status}}' "$web_container")" = "healthy" || return 1
  test "$(docker inspect --format '{{.State.Health.Status}}' "$api_container")" = "healthy" || return 1
  test "$(docker inspect --format '{{.State.Status}}' "$worker_container")" = "running" || return 1
  test "$(docker inspect --format '{{.RestartCount}}' "$worker_container")" -lt 2 || return 1

  attempts=0
  public_url=${APP_PUBLIC_URL%/}
  until curl --noproxy '*' --fail --silent --show-error --max-time 10 "${public_url}/healthz" >/dev/null \
    && curl --noproxy '*' --fail --silent --show-error --max-time 10 "${public_url}/api/ready" >/dev/null; do
    attempts=$((attempts + 1))
    test "$attempts" -lt 12 || return 1
    sleep 5
  done
}

current_before=$(readlink -f /opt/globortunity/current 2>/dev/null || true)
if activate \
  && { [ -z "$current_before" ] || [ "$current_before" = "$release_root" ] || ln -sfn "$current_before" /opt/globortunity/previous; } \
  && ln -sfn "$release_root" /opt/globortunity/current \
  && sh "$release_root/infra/prune-releases.sh"; then
  exit 0
fi

echo "New release failed health checks; attempting previous release rollback" >&2
if [ "${GLOBORTUNITY_SKIP_ROLLBACK:-0}" != "1" ] && [ -L /opt/globortunity/current ]; then
  previous_release=$(readlink -f /opt/globortunity/current || true)
  previous_archive="$previous_release/images.tar.gz"
  previous_tag=$(basename "$previous_release")
  if [ -f "$previous_archive" ] && [ "$previous_release" != "$release_root" ]; then
    (
      cd "$previous_release"
      DEPLOY_TAG="$previous_tag" GLOBORTUNITY_LOCK_HELD=1 GLOBORTUNITY_SKIP_ROLLBACK=1 sh infra/remote-deploy.sh "$previous_archive"
    ) || echo "Previous release rollback also failed" >&2
  fi
fi
exit 1
