#!/usr/bin/env bash
set -euo pipefail

config_file="${ARENA_STATIC_SYNC_CONFIG:-/etc/hs-arena/edge-static-sync.conf}"
if [[ ! -r "$config_file" ]]; then
  echo "Static sync configuration is not readable: $config_file" >&2
  exit 2
fi

# The configuration is root-managed and defines ARENA_STATIC_EDGE_SPECS as
# "user@host|identity" entries. Keeping topology outside the release makes
# node replacement independent from application deployment.
# shellcheck source=/dev/null
source "$config_file"

release_link="${ARENA_STATIC_RELEASE_LINK:-/var/www/koloda/data/www/hs-arena.ru/current}"
known_hosts="${ARENA_STATIC_KNOWN_HOSTS:-/home/debian/.ssh/known_hosts}"
remote_root="/srv/arena/static"

if ! declare -p ARENA_STATIC_EDGE_SPECS >/dev/null 2>&1; then
  echo "ARENA_STATIC_EDGE_SPECS is not configured" >&2
  exit 2
fi
if [[ ${#ARENA_STATIC_EDGE_SPECS[@]} -eq 0 ]]; then
  echo "ARENA_STATIC_EDGE_SPECS is empty" >&2
  exit 2
fi

release="$(basename "$(readlink -f "$release_link")")"
source_root="$release_link/dist"
if [[ ! "$release" =~ ^[a-f0-9]{40}$ ]]; then
  echo "Invalid production release SHA: $release" >&2
  exit 2
fi
if [[ ! -s "$source_root/index.html" ]]; then
  echo "Production frontend entry is missing for $release" >&2
  exit 2
fi

failures=0
for edge_spec in "${ARENA_STATIC_EDGE_SPECS[@]}"; do
  IFS='|' read -r edge identity <<< "$edge_spec"
  if [[ -z "$edge" || -z "$identity" || ! -r "$identity" ]]; then
    echo "Invalid static edge specification: $edge_spec" >&2
    failures=$((failures + 1))
    continue
  fi
  ssh_options=(
    -i "$identity"
    -o BatchMode=yes
    -o StrictHostKeyChecking=yes
    -o UserKnownHostsFile="$known_hosts"
    -o ConnectTimeout=10
  )
  expected_current="$remote_root/versions/$release/dist"
  remote_current="$(ssh "${ssh_options[@]}" "$edge" \
    "sudo readlink -f '$remote_root/current'" 2>/dev/null || true)"
  if [[ "$remote_current" == "$expected_current" ]]; then
    echo "Static assets already current on $edge"
    continue
  fi

  if ! ssh "${ssh_options[@]}" "$edge" \
      "sudo /usr/local/sbin/activate-arena-static prepare '$release'"; then
    echo "Static prepare failed on $edge" >&2
    failures=$((failures + 1))
    continue
  fi

  # --link-dest compares the candidate against the active immutable tree and
  # hard-links unchanged files. Changed files are transferred into the
  # inactive version and --delay-updates keeps them hidden until rsync ends.
  if ! rsync -a --omit-dir-times --delete --delay-updates \
      --link-dest="$remote_root/current" \
      --rsync-path='sudo rsync' \
      -e "ssh -i $identity -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$known_hosts -o ConnectTimeout=10" \
      "$source_root/" \
      "$edge:$remote_root/versions/$release/dist/"; then
    echo "Static sync failed on $edge" >&2
    failures=$((failures + 1))
    continue
  fi

  if ! ssh "${ssh_options[@]}" "$edge" \
      "sudo /usr/local/sbin/activate-arena-static activate '$release'"; then
    echo "Static activation failed on $edge" >&2
    failures=$((failures + 1))
  fi
done

exit "$failures"
