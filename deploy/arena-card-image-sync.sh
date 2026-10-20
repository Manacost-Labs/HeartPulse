#!/usr/bin/env bash
set -euo pipefail

source_root="${ARENA_CARD_IMAGE_SOURCE_ROOT:-/var/www/koloda/data/www/hs-arena.ru/shared/server-data/card-images}"
release_root="${ARENA_CARD_IMAGE_RELEASE_ROOT:-/var/www/koloda/data/www/hs-arena.ru/current}"
config_file="${ARENA_CARD_IMAGE_SYNC_CONFIG:-/etc/hs-arena/edge-static-sync.conf}"
if [[ ! -r "$config_file" ]]; then
  echo "Edge topology configuration is not readable: $config_file" >&2
  exit 2
fi

# Card images follow the same root-managed "user@host|identity" topology as the
# frontend sync, so a quarantined or replaced edge is changed in one place.
# shellcheck source=/dev/null
source "$config_file"
if declare -p ARENA_CARD_IMAGE_EDGE_SPECS >/dev/null 2>&1; then
  edge_specs=("${ARENA_CARD_IMAGE_EDGE_SPECS[@]}")
elif declare -p ARENA_STATIC_EDGE_SPECS >/dev/null 2>&1; then
  edge_specs=("${ARENA_STATIC_EDGE_SPECS[@]}")
else
  edge_specs=()
fi
if [[ ${#edge_specs[@]} -eq 0 ]]; then
  echo "No card image edges are configured in $config_file" >&2
  exit 2
fi
known_hosts="${ARENA_CARD_IMAGE_KNOWN_HOSTS:-${ARENA_STATIC_KNOWN_HOSTS:-/home/debian/.ssh/known_hosts}}"

# Best-effort edges (for example a node that is being brought up) are synced on
# every run, but their failures are only logged and recorded in the status
# directory: they never make the service, or a deploy that starts it, fail.
optional_config="${ARENA_CARD_IMAGE_OPTIONAL_CONFIG:-/etc/hs-arena/card-image-optional-edges.conf}"
optional_specs=()
if [[ -r "$optional_config" ]]; then
  # shellcheck source=/dev/null
  source "$optional_config"
  if declare -p ARENA_CARD_IMAGE_OPTIONAL_EDGE_SPECS >/dev/null 2>&1; then
    optional_specs=("${ARENA_CARD_IMAGE_OPTIONAL_EDGE_SPECS[@]}")
  fi
fi
status_dir="${ARENA_CARD_IMAGE_STATUS_DIR:-/var/lib/arena-edge/card-sync}"

version="$(node --input-type=module -e \
  "import('${release_root}/build/server/cardImageCache.js').then(m => process.stdout.write(m.CARD_IMAGE_CACHE_VERSION))")"
if [[ ! "$version" =~ ^card_img_v[0-9]+(_[A-Za-z0-9_]+)?$ ]]; then
  echo "Invalid production card image cache version: $version" >&2
  exit 1
fi

sync_edge() {
  local edge="$1" identity="$2" rsync_log
  local ssh_options=(
    -i "$identity"
    -o BatchMode=yes
    -o StrictHostKeyChecking=yes
    -o UserKnownHostsFile="$known_hosts"
    -o ConnectTimeout=10
  )
  if ! ssh "${ssh_options[@]}" "$edge" \
      "sudo /usr/local/sbin/activate-arena-card-images prepare '$version'"; then
    echo "Card image prepare failed on $edge" >&2
    return 1
  fi

  rsync_log="$(mktemp /tmp/arena-card-rsync.XXXXXX)"
  if ! rsync -a --omit-dir-times --delete --delete-excluded --delay-updates --itemize-changes \
      --include="*-${version}.webp" \
      --exclude='*' \
      --rsync-path='sudo rsync' \
      -e "ssh -i $identity -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$known_hosts -o ConnectTimeout=10" \
      "$source_root/" \
      "$edge:/srv/arena/card-images/versions/$version/raw/" > "$rsync_log"; then
    echo "Card image sync failed on $edge" >&2
    rm -f -- "$rsync_log"
    return 1
  fi

  if ! grep -Eq '^(>|\*deleting)' "$rsync_log" && ssh "${ssh_options[@]}" "$edge" \
      "sudo /usr/local/sbin/activate-arena-card-images current '$version'"; then
    rm -f -- "$rsync_log"
    echo "Card images already current on $edge"
    return 0
  fi
  rm -f -- "$rsync_log"

  if ! ssh "${ssh_options[@]}" "$edge" \
      "sudo /usr/local/sbin/activate-arena-card-images activate '$version'"; then
    echo "Card image activation failed on $edge" >&2
    return 1
  fi
}

record_status() {
  local edge="$1" result="$2"
  install -d -m 0755 "$status_dir" 2>/dev/null || return 0
  printf '%s %s %s\n' "$result" "$version" "$(date -u +%FT%TZ)" > "$status_dir/${edge//[^A-Za-z0-9.@_-]/_}.status" || true
}

failures=0
for edge_spec in "${edge_specs[@]}"; do
  IFS='|' read -r edge identity <<< "$edge_spec"
  if sync_edge "$edge" "$identity"; then
    record_status "$edge" ok
  else
    record_status "$edge" failed
    failures=$((failures + 1))
  fi
done

for edge_spec in "${optional_specs[@]}"; do
  IFS='|' read -r edge identity <<< "$edge_spec"
  if sync_edge "$edge" "$identity"; then
    record_status "$edge" ok
  else
    record_status "$edge" failed
    echo "Best-effort card image edge failed and is not counted: $edge" >&2
  fi
done

exit "$failures"
