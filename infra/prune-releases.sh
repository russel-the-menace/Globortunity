#!/bin/sh
set -eu

releases_root=/opt/globortunity/releases
current_release=
previous_release=
if [ -L /opt/globortunity/current ]; then
  current_release=$(readlink -f /opt/globortunity/current)
fi
if [ -L /opt/globortunity/previous ]; then
  previous_release=$(readlink -f /opt/globortunity/previous)
fi

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
