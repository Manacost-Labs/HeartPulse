#!/usr/bin/env bash
set -euo pipefail

root="${ARENA_STATIC_ROOT:-/srv/arena/static}"
minimum_files="${ARENA_STATIC_MIN_FILES:-5000}"
minimum_bytes="${ARENA_STATIC_MIN_BYTES:-100000000}"
keep_releases="${ARENA_STATIC_KEEP_RELEASES:-3}"
prepare_ttl_minutes="${ARENA_STATIC_PREPARE_TTL_MINUTES:-60}"
skip_reload="${ARENA_STATIC_SKIP_RELOAD:-0}"
mode="${1:-}"
release="${2:-}"

if [[ "$root" != /* || "$root" == / ]]; then
  echo "Invalid static root" >&2
  exit 2
fi
if [[ ! "$minimum_files" =~ ^[0-9]+$ || ! "$minimum_bytes" =~ ^[0-9]+$ ]]; then
  echo "Invalid static publication thresholds" >&2
  exit 2
fi
if [[ ! "$keep_releases" =~ ^[0-9]+$ ]] || (( keep_releases < 2 )); then
  echo "Invalid static release retention" >&2
  exit 2
fi
if [[ ! "$prepare_ttl_minutes" =~ ^[0-9]+$ ]] || (( prepare_ttl_minutes < 1 )); then
  echo "Invalid prepared-release grace period" >&2
  exit 2
fi
if [[ ! "$release" =~ ^[a-f0-9]{40}$ ]]; then
  echo "Invalid release SHA" >&2
  exit 2
fi

release_root="$root/versions/$release"
dist="$release_root/dist"

prune_old_releases() {
  local active candidate candidate_release manifest retained=1
  active="$(readlink -f "$root/current")"
  [[ "$active" == "$root"/versions/*/dist ]] || {
    echo "Invalid active static release" >&2
    exit 1
  }

  while IFS= read -r -d '' candidate; do
    [[ "$candidate" =~ /[a-f0-9]{40}$ ]] || continue
    if [[ "$active" == "$candidate/dist" ]]; then
      continue
    fi
    candidate_release="${candidate##*/}"
    manifest="$candidate/manifest.json"
    if [[ ! -s "$candidate/dist/index.html" || ! -s "$manifest" ]] \
      || ! grep -Fq -- "\"release\":\"$candidate_release\"" "$manifest"; then
      if ! find "$candidate" -mmin "-$prepare_ttl_minutes" -print -quit | grep -q .; then
        rm -rf -- "$candidate"
      fi
      continue
    fi
    if (( retained < keep_releases )); then
      retained=$((retained + 1))
      continue
    fi
    rm -rf -- "$candidate"
  done < <(find "$root/versions" -mindepth 1 -maxdepth 1 -type d \
    -regextype posix-extended -regex '.*/[a-f0-9]{40}' \
    -printf '%T@ %p\0' | sort -z -nr | cut -z -d ' ' -f 2-)
}

reload_nginx() {
  if [[ "$skip_reload" == 1 ]]; then return; fi
  nginx -t
  systemctl reload nginx
}

restore_active_release() {
  local previous_active="$1" rollback_link
  [[ "$previous_active" == "$root"/versions/*/dist ]] || return 1
  rollback_link="$root/.current-rollback-$$"
  ln -s "${previous_active#"$root/"}" "$rollback_link"
  mv -Tf "$rollback_link" "$root/current"
  reload_nginx
}

case "$mode" in
  prepare)
    install -d -o root -g root -m 0755 "$root" "$root/versions" "$release_root" "$dist"
    ;;
  activate)
    test -s "$dist/index.html"
    files="$(find "$dist" -type f | wc -l)"
    bytes="$(du -sb "$dist" | awk '{print $1}')"
    if (( files < minimum_files || bytes < minimum_bytes )); then
      echo "Refusing incomplete static publication: files=$files bytes=$bytes" >&2
      exit 1
    fi
    previous_active="$(readlink -f "$root/current")"
    [[ "$previous_active" == "$root"/versions/*/dist ]] || {
      echo "Invalid previous static release" >&2
      exit 1
    }
    if [[ "$skip_reload" != 1 ]]; then nginx -t; fi
    temporary_link="$root/.current-${release}-$$"
    ln -s "versions/$release/dist" "$temporary_link"
    mv -Tf "$temporary_link" "$root/current"
    printf '{"release":"%s","files":%s,"bytes":%s,"publishedAt":"%s"}\n' \
      "$release" "$files" "$bytes" "$(date -u +%FT%TZ)" > "$release_root/manifest.json"
    if ! reload_nginx; then
      restore_active_release "$previous_active" || true
      exit 1
    fi
    prune_old_releases
    ;;
  prune)
    test -s "$dist/index.html"
    [[ "$(readlink -f "$root/current")" == "$dist" ]] || {
      echo "Refusing to prune for an inactive release" >&2
      exit 1
    }
    prune_old_releases
    ;;
  *)
    echo "Usage: $0 prepare|activate|prune RELEASE_SHA" >&2
    exit 2
    ;;
esac
