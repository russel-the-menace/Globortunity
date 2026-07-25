#!/bin/sh
set -eu

releases_root=/opt/globortunity/releases
current_release=$(readlink -f /opt/globortunity/current 2>/dev/null || true)
previous_release=$(readlink -f /opt/globortunity/previous 2>/dev/null || true)

find "$releases_root" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
  | while IFS= read -r tag; do
      case "$tag" in
        ""|*[!0-9a-f]*) continue ;;
      esac
      [ "${#tag}" -eq 40 ] || continue
      release="$releases_root/$tag"
      [ "$release" != "$current_release" ] || continue
      [ "$release" != "$previous_release" ] || continue
      rm -rf -- "$release"
      docker image rm "globortunity-api:$tag" "globortunity-worker:$tag" "globortunity-web:$tag" >/dev/null 2>&1 || true
    done
