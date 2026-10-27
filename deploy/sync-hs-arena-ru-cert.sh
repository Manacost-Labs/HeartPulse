#!/usr/bin/env bash
# Copies the retired hs-arena.ru certificate from the edge that renews it
# (Moscow, certbot lineage /etc/letsencrypt/live/hs-arena.ru) to every edge
# that only holds a copy, whenever that copy differs. Run as root on the
# origin; the hs-arena-ru-cert-sync timer runs it daily. The zone is in another
# Cloudflare account than the origin's DNS-01 tokens, so the certificate can
# only renew on Moscow (HTTP-01).
#
#   sync-hs-arena-ru-cert            # exit 0 current or updated, 1 failure
#
# The key crosses the origin only as an SSH stream, never as a file. A target
# installs the copy only when it is unexpired and matches its key, keeps the
# replaced files under /root/hs-arena-cert-backup/, and restores them if
# `nginx -t` fails. docs/runbooks/hearthpulse-edge-caching.md#retired-hs-arenaru
set -euo pipefail

config_file="${ARENA_STATIC_SYNC_CONFIG:-/etc/hs-arena/edge-static-sync.conf}"
if [[ ! -r "$config_file" ]]; then
  echo "Edge configuration is not readable: $config_file" >&2
  exit 2
fi
# shellcheck source=/dev/null
source "$config_file"
known_hosts="${ARENA_STATIC_KNOWN_HOSTS:-/home/debian/.ssh/known_hosts}"
source_edge="${HS_ARENA_CERT_SOURCE:-194.67.92.242}"
read -r -a target_edges <<< "${HS_ARENA_CERT_TARGETS:-186.246.28.244}"
lineage=/etc/letsencrypt/live/hs-arena.ru
destination=/etc/nginx/ssl/hs-arena.ru

# Runs a command on an edge from the static-sync topology as its root login.
edge_ssh() {
  local wanted=$1 spec edge identity
  shift
  for spec in "${ARENA_STATIC_EDGE_SPECS[@]}"; do
    IFS='|' read -r edge identity <<< "$spec"
    if [[ "$wanted" == "$edge" || "$wanted" == "${edge#*@}" ]]; then
      # The command expands here on purpose.
      # shellcheck disable=SC2029
      ssh -i "$identity" -o BatchMode=yes -o StrictHostKeyChecking=yes \
        -o UserKnownHostsFile="$known_hosts" -o ConnectTimeout=10 "$edge" "$@"
      return
    fi
  done
  echo "Edge is not in the topology: $wanted" >&2
  return 2
}

source_hash="$(edge_ssh "$source_edge" \
  "openssl x509 -checkend 0 -noout -in '$lineage/fullchain.pem' >/dev/null && sha256sum < '$lineage/fullchain.pem'")" || {
  echo "The certificate on $source_edge is missing or expired: $lineage" >&2
  exit 1
}

read -r -d '' remote_install <<'REMOTE' || true
set -euo pipefail
destination=$1
stage="$(mktemp -d "$destination/.sync.XXXXXX")"
trap 'rm -rf "$stage"' EXIT
tar -x -C "$stage"
openssl x509 -checkend 0 -noout -in "$stage/fullchain.pem" >/dev/null
certificate_key="$(openssl x509 -noout -pubkey -in "$stage/fullchain.pem" | sha256sum)"
private_key="$(openssl pkey -pubout -in "$stage/privkey.pem" | sha256sum)"
if [[ "$certificate_key" != "$private_key" ]]; then
  echo "the received certificate does not match its key" >&2
  exit 1
fi
backup="/root/hs-arena-cert-backup/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup"
for name in fullchain privkey; do
  if [[ -e "$destination/letsencrypt-$name.pem" ]]; then cp -a "$destination/letsencrypt-$name.pem" "$backup/"; fi
done
chmod 0644 "$stage/fullchain.pem"
chmod 0600 "$stage/privkey.pem"
mv -f "$stage/privkey.pem" "$destination/letsencrypt-privkey.pem"
mv -f "$stage/fullchain.pem" "$destination/letsencrypt-fullchain.pem"
if nginx -t; then
  systemctl reload nginx
  echo "updated; backup $backup"
  exit 0
fi
for name in fullchain privkey; do
  if [[ -e "$backup/letsencrypt-$name.pem" ]]; then cp -a "$backup/letsencrypt-$name.pem" "$destination/"; fi
done
nginx -t || echo "nginx -t still fails with the restored certificate" >&2
echo "nginx -t failed; previous certificate restored from $backup" >&2
exit 1
REMOTE

failed=0
for target in "${target_edges[@]}"; do
  target_hash="$(edge_ssh "$target" "sha256sum < '$destination/letsencrypt-fullchain.pem' 2>/dev/null || true")" || {
    echo "hs-arena.ru certificate sync: $target is unreachable" >&2
    failed=1
    continue
  }
  if [[ "$target_hash" == "$source_hash" ]]; then
    echo "$target: current"
    continue
  fi
  echo "$target: copying the certificate from $source_edge"
  # shellcheck disable=SC2029
  if ! edge_ssh "$source_edge" "tar -C '$lineage' -chf - fullchain.pem privkey.pem" \
      | edge_ssh "$target" "bash -c $(printf '%q' "$remote_install") sync-hs-arena-ru-cert '$destination'"; then
    echo "hs-arena.ru certificate sync failed: $target" >&2
    failed=1
  fi
done
exit "$failed"
