#!/usr/bin/env bash
set -euo pipefail

root="/srv/arena/static"
mode="${1:-}"
release="${2:-}"

if [[ ! "$release" =~ ^[a-f0-9]{40}$ ]]; then
  echo "Invalid release SHA" >&2
  exit 2
fi

release_root="$root/versions/$release"
dist="$release_root/dist"

case "$mode" in
  prepare)
    install -d -o root -g root -m 0755 "$root" "$root/versions" "$release_root" "$dist"
    ;;
  activate)
    test -s "$dist/index.html"
    files="$(find "$dist" -type f | wc -l)"
    bytes="$(du -sb "$dist" | awk '{print $1}')"
    if (( files < 5000 || bytes < 100000000 )); then
      echo "Refusing incomplete static publication: files=$files bytes=$bytes" >&2
      exit 1
    fi
    temporary_link="$root/.current-${release}-$$"
    ln -s "versions/$release/dist" "$temporary_link"
    mv -Tf "$temporary_link" "$root/current"
    printf '{"release":"%s","files":%s,"bytes":%s,"publishedAt":"%s"}\n' \
      "$release" "$files" "$bytes" "$(date -u +%FT%TZ)" > "$release_root/manifest.json"
    nginx -t
    systemctl reload nginx
    ;;
  *)
    echo "Usage: $0 prepare|activate RELEASE_SHA" >&2
    exit 2
    ;;
esac
