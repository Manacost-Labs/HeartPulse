#!/usr/bin/env bash
# Compares or installs the HearthPulse edge nginx files of a release on every
# regional edge, one edge at a time. Run as root on the origin:
#
#   install-hearthpulse-edge-nginx --check [EDGE...]    # unified diff, exit 1 on drift
#   install-hearthpulse-edge-nginx --install [EDGE...]  # back up, install, nginx -t, reload
#
# EDGE is an address or `user@address` from the topology; without one every
# configured edge is used, in configuration order.
# The edge topology and SSH identities come from the same root-only file as the
# static sync (/etc/hs-arena/edge-static-sync.conf). An install stops at the
# first edge that fails; that edge has already restored its previous files.
# docs/runbooks/hearthpulse-edge-caching.md
set -euo pipefail

mode="${1:-}"
if [[ "$mode" != --check && "$mode" != --install ]]; then
  echo "Usage: install-hearthpulse-edge-nginx --check|--install [EDGE...]" >&2
  exit 2
fi
shift
selected=("$@")

config_file="${ARENA_STATIC_SYNC_CONFIG:-/etc/hs-arena/edge-static-sync.conf}"
if [[ ! -r "$config_file" ]]; then
  echo "Edge configuration is not readable: $config_file" >&2
  exit 2
fi
# shellcheck source=/dev/null
source "$config_file"

release="${HEARTHPULSE_EDGE_NGINX_RELEASE:-${ARENA_STATIC_RELEASE_LINK:-/var/www/koloda/data/www/hs-arena.ru/current}}"
known_hosts="${ARENA_STATIC_KNOWN_HOSTS:-/home/debian/.ssh/known_hosts}"
if ! declare -p ARENA_STATIC_EDGE_SPECS >/dev/null 2>&1 || [[ ${#ARENA_STATIC_EDGE_SPECS[@]} -eq 0 ]]; then
  echo "ARENA_STATIC_EDGE_SPECS is not configured" >&2
  exit 2
fi

# Release source and edge destination, in installation order: the vhosts
# reference the zones and maps declared by the conf.d file.
files=(
  "deploy/nginx/arena-edge-cache-path.conf|/etc/nginx/conf.d/34-arena-edge-cache-path.conf"
  "deploy/nginx/hearthpulse-shadow-app.conf|/etc/nginx/sites-available/hearthpulse-shadow-app.conf"
  "deploy/nginx/hearthpulse-shadow-cdn.conf|/etc/nginx/sites-available/hearthpulse-shadow-cdn.conf"
)
for entry in "${files[@]}"; do
  source_file="$release/${entry%%|*}"
  if [[ ! -s "$source_file" ]]; then
    echo "Release file is missing: $source_file" >&2
    exit 2
  fi
done

# Runs on the edge as root with a tar of the release files on stdin. A failed
# `nginx -t` restores every file it replaced and reloads nothing.
read -r -d '' remote_install <<'REMOTE' || true
set -euo pipefail
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
tar -x -C "$stage"
backup="/root/hearthpulse-nginx-backup/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup"
nginx -T > "$backup/nginx-T.txt" 2>&1 || true
installed=()
for entry in "$@"; do
  name="${entry%%|*}"
  target="${entry#*|}"
  if [[ -e "$target" ]]; then cp -a "$target" "$backup/$(basename "$target")"; fi
  install -m 0644 -o root -g root "$stage/$name" "$target"
  installed+=("$target")
done
if nginx -t; then
  systemctl reload nginx
  echo "installed; backup $backup"
  exit 0
fi
for target in "${installed[@]}"; do
  if [[ -e "$backup/$(basename "$target")" ]]; then
    cp -a "$backup/$(basename "$target")" "$target"
  else
    rm -f "$target"
  fi
done
nginx -t
echo "nginx -t failed; previous files restored from $backup" >&2
exit 1
REMOTE

drift=0
matched=0
for edge_spec in "${ARENA_STATIC_EDGE_SPECS[@]}"; do
  IFS='|' read -r edge identity <<< "$edge_spec"
  if [[ ${#selected[@]} -gt 0 ]]; then
    wanted=0
    for name in "${selected[@]}"; do [[ "$name" == "$edge" || "$name" == "${edge#*@}" ]] && wanted=1; done
    [[ "$wanted" == 1 ]] || continue
  fi
  matched=$((matched + 1))
  if [[ -z "$edge" || -z "$identity" || ! -r "$identity" ]]; then
    echo "Invalid edge specification: $edge_spec" >&2
    exit 2
  fi
  ssh_options=(-i "$identity" -o BatchMode=yes -o StrictHostKeyChecking=yes
    -o UserKnownHostsFile="$known_hosts" -o ConnectTimeout=10)

  if [[ "$mode" == --check ]]; then
    live="$(mktemp)"
    for entry in "${files[@]}"; do
      target="${entry#*|}"
      # A missing file compares as empty. The path expands here on purpose.
      # shellcheck disable=SC2029
      ssh "${ssh_options[@]}" "$edge" "sudo cat '$target'" > "$live" 2>/dev/null || : > "$live"
      if ! diff -u --label "$edge:$target" --label "release:${entry%%|*}" "$live" "$release/${entry%%|*}"; then
        drift=1
      fi
    done
    rm -f "$live"
    # The canonical server must come from the managed vhost, not a stale copy.
    ssh "${ssh_options[@]}" "$edge" \
      "sudo nginx -T 2>/dev/null | grep -E '^# configuration file .*(hearthpulse|sites-enabled)' || true"
    continue
  fi

  stage="$(mktemp -d)"
  remote_args=()
  for entry in "${files[@]}"; do
    name="$(basename "${entry%%|*}")"
    cp "$release/${entry%%|*}" "$stage/$name"
    remote_args+=("$name|${entry#*|}")
  done
  echo "Installing HearthPulse edge nginx on $edge"
  # shellcheck disable=SC2029
  if ! tar -C "$stage" -cf - . | ssh "${ssh_options[@]}" "$edge" \
      "sudo bash -c $(printf '%q' "$remote_install") install-hearthpulse-edge-nginx $(printf '%q ' "${remote_args[@]}")"; then
    rm -rf "$stage"
    echo "Install failed on $edge; later edges were not changed" >&2
    exit 1
  fi
  rm -rf "$stage"
done

if [[ ${#selected[@]} -gt 0 && "$matched" -ne ${#selected[@]} ]]; then
  echo "Not every requested edge is in the topology: ${selected[*]}" >&2
  exit 2
fi
exit "$drift"
