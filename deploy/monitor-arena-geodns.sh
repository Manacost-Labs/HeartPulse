#!/usr/bin/env bash
set -euo pipefail

domain="${ARENA_MONITOR_DOMAIN:-arena.hs-manacost.ru}"
cdn_domain="${ARENA_MONITOR_CDN_DOMAIN:-cdn.arena.hs-manacost.ru}"
timeweb_domain="${ARENA_MONITOR_TIMEWEB_DOMAIN:-xa3umh5n3j.cdn.twcstorage.ru}"
release_link="${ARENA_MONITOR_RELEASE_LINK:-/var/www/koloda/data/www/hs-arena.ru/current}"
edge_config="${ARENA_MONITOR_EDGE_CONFIG:-/etc/hs-arena/edge-static-sync.conf}"
minimum_disk_available_bytes="${ARENA_MONITOR_MIN_DISK_AVAILABLE_BYTES:-8589934592}"
known_card_path="${ARENA_MONITOR_CARD_PATH:-/api/card-image/DINO_410/full.webp}"

nameservers=("194.67.92.242" "162.19.220.14")
ru_edges=("186.246.28.244" "194.67.92.242")
eu_edge="162.19.220.14"
eu_ipv6="2001:41d0:701:1100::709b"
edge_specs=(
  "ru-moscow|194.67.92.242|root@194.67.92.242"
  "ru-novosibirsk|186.246.28.244|root@186.246.28.244"
  "eu-germany-limburg|162.19.220.14|debian@162.19.220.14"
)

if [[ ! "$minimum_disk_available_bytes" =~ ^[0-9]+$ ]]; then
  echo "FAIL: invalid disk reserve" >&2
  exit 2
fi
if [[ ! -r "$edge_config" ]]; then
  echo "FAIL: edge configuration is not readable" >&2
  exit 2
fi
# shellcheck source=/dev/null
source "$edge_config"
if ! declare -p ARENA_STATIC_EDGE_SPECS >/dev/null 2>&1; then
  echo "FAIL: ARENA_STATIC_EDGE_SPECS is not configured" >&2
  exit 2
fi
known_hosts="${ARENA_STATIC_KNOWN_HOSTS:-/home/debian/.ssh/known_hosts}"

release="$(basename "$(readlink -f "$release_link")")"
[[ "$release" =~ ^[a-f0-9]{40}$ ]] || {
  echo "FAIL: current production release is invalid" >&2
  exit 1
}
release_dist="$release_link/dist"
index_html="$(<"$release_dist/index.html")"
asset_path=""
if [[ "$index_html" =~ src=\"(/assets/index-[^\"]+\.js)\" ]]; then
  asset_path="${BASH_REMATCH[1]}"
fi
[[ -n "$asset_path" && -s "$release_dist$asset_path" ]] || {
  echo "FAIL: current frontend entry asset was not found" >&2
  exit 1
}
expected_asset_sha="$(sha256sum "$release_dist$asset_path" | awk '{print $1}')"

failures=0
fail() {
  printf 'FAIL: %s\n' "$*" >&2
  failures=$((failures + 1))
}

contains_line() {
  local needle="$1"
  grep -Fxq -- "$needle"
}

resolved_target() {
  local address="$1"
  if [[ "$address" == *:* ]]; then printf '[%s]' "$address"; else printf '%s' "$address"; fi
}

resolved_status() {
  local host="$1" address="$2" path="$3"
  curl --noproxy '*' --silent --show-error --connect-timeout 5 --max-time 20 \
    --resolve "$host:443:$(resolved_target "$address")" \
    --output /dev/null --write-out '%{http_code}' "https://$host$path"
}

resolved_headers() {
  local host="$1" address="$2" path="$3"
  shift 3
  curl --noproxy '*' --silent --show-error --connect-timeout 5 --max-time 20 \
    --resolve "$host:443:$(resolved_target "$address")" \
    --head "$@" "https://$host$path"
}

header_value() {
  local name="$1"
  awk -F ': *' -v wanted="$name" 'BEGIN { IGNORECASE=1 } tolower($1) == tolower(wanted) { value=$2 } END { sub(/\r$/, "", value); print value }'
}

for ns in "${nameservers[@]}"; do
  ru_a="$(dig +short "@$ns" "$domain" A +subnet=95.24.0.0/24 | sort -u)"
  de_a="$(dig +short "@$ns" "$domain" A +subnet=80.187.0.0/24 | sort -u)"
  ru_aaaa="$(dig +short "@$ns" "$domain" AAAA +subnet=95.24.0.0/24 | sort -u)"
  de_aaaa="$(dig +short "@$ns" "$domain" AAAA +subnet=80.187.0.0/24 | sort -u)"

  for expected in "${ru_edges[@]}"; do
    contains_line "$expected" <<< "$ru_a" || fail "$ns did not return RU edge $expected"
  done
  [[ "$de_a" == "$eu_edge" ]] || fail "$ns returned unexpected DE A set: $de_a"
  [[ -z "$ru_aaaa" ]] || fail "$ns exposed IPv6 to RU clients: $ru_aaaa"
  [[ "$de_aaaa" == "$eu_ipv6" ]] || fail "$ns returned unexpected DE AAAA set: $de_aaaa"
done

for edge_spec in "${edge_specs[@]}"; do
  IFS='|' read -r region address ssh_target <<< "$edge_spec"
  identity=""
  for configured in "${ARENA_STATIC_EDGE_SPECS[@]}"; do
    IFS='|' read -r configured_target configured_identity <<< "$configured"
    if [[ "$configured_target" == "$ssh_target" ]]; then identity="$configured_identity"; break; fi
  done
  if [[ -z "$identity" || ! -r "$identity" ]]; then
    fail "$region has no readable SSH identity"
    continue
  fi

  remote_state="$(ssh -i "$identity" -o BatchMode=yes -o StrictHostKeyChecking=yes \
    -o UserKnownHostsFile="$known_hosts" -o ConnectTimeout=10 "$ssh_target" \
    "printf 'disk_available_bytes='; df -B1 --output=avail / | tail -1 | tr -d ' '; printf '\\nstatic_release='; sudo basename \"\$(sudo dirname \"\$(sudo readlink -f /srv/arena/static/current)\")\"" \
    2>/dev/null)" || remote_state=""
  disk_available_bytes="$(sed -n 's/^disk_available_bytes=//p' <<< "$remote_state")"
  static_release="$(sed -n 's/^static_release=//p' <<< "$remote_state")"
  if [[ ! "$disk_available_bytes" =~ ^[0-9]+$ ]]; then
    fail "$region disk reserve is unavailable"
  elif (( disk_available_bytes < minimum_disk_available_bytes )); then
    fail "$region disk_available_bytes=$disk_available_bytes is below $minimum_disk_available_bytes"
  fi
  [[ "$static_release" == "$release" ]] || fail "$region static release is ${static_release:-unavailable}, expected $release"
  printf 'edge=%s disk_available_bytes=%s static_release=%s\n' \
    "$region" "${disk_available_bytes:-unknown}" "${static_release:-unknown}"

  status="$(resolved_status "$domain" "$address" /standard/cards/ 2>/dev/null || printf 000)"
  [[ "$status" == 200 ]] || fail "$region application host returned $status"

  card_headers="$(resolved_headers "$cdn_domain" "$address" "$known_card_path" 2>/dev/null || true)"
  [[ "$(header_value X-Proxy-Cache <<< "$card_headers")" == LOCAL ]] \
    || fail "$region card image was not served from the local mirror"
  [[ "$(header_value X-CDN-Region <<< "$card_headers")" == "$region" ]] \
    || fail "$region CDN label is missing from the card response"

  asset_headers="$(resolved_headers "$cdn_domain" "$address" "$asset_path" \
    -H 'Accept-Encoding: gzip' 2>/dev/null || true)"
  [[ "$(header_value Content-Encoding <<< "$asset_headers")" == gzip ]] \
    || fail "$region CDN asset is not gzip encoded"
  [[ "$(header_value X-Proxy-Cache <<< "$asset_headers")" == LOCAL ]] \
    || fail "$region CDN asset was not served from the local mirror"

  private_status="$(resolved_status "$cdn_domain" "$address" /api/subscription/status 2>/dev/null || printf 000)"
  [[ "$private_status" == 404 ]] || fail "$region CDN exposed private API with HTTP $private_status"

  downloaded="$(mktemp /tmp/arena-cdn-asset.XXXXXX)"
  if curl --noproxy '*' --silent --show-error --fail --compressed --connect-timeout 5 --max-time 20 \
      -H 'Accept-Encoding: gzip' --resolve "$cdn_domain:443:$address" \
      "https://$cdn_domain$asset_path" -o "$downloaded"; then
    actual_asset_sha="$(sha256sum "$downloaded" | awk '{print $1}')"
    [[ "$actual_asset_sha" == "$expected_asset_sha" ]] \
      || fail "$region CDN asset content differs from the production release"
  else
    fail "$region CDN asset body could not be downloaded"
  fi
  rm -f -- "$downloaded"
done

for host in "$domain" "$cdn_domain"; do
  status="$(resolved_status "$host" "$eu_ipv6" \
    "$([[ "$host" == "$domain" ]] && printf /standard/cards/ || printf %s "$known_card_path")" \
    2>/dev/null || printf 000)"
  [[ "$status" == 200 ]] || fail "Limburg IPv6 $host returned $status"
done

for timeweb_path in / /runtime-config.js /api/health/ready; do
  timeweb_headers="$(curl --noproxy '*' --silent --show-error --connect-timeout 5 --max-time 20 \
    --head "https://$timeweb_domain$timeweb_path" 2>/dev/null || true)"
  timeweb_status="$(awk '/^HTTP\// { code=$2 } END { print code }' <<< "$timeweb_headers")"
  timeweb_cache_control="$(header_value Cache-Control <<< "$timeweb_headers")"
  [[ "$timeweb_status" == 200 ]] \
    || fail "Timeweb $timeweb_path returned HTTP ${timeweb_status:-unavailable}"
  [[ "$timeweb_cache_control" == *no-store* ]] \
    || fail "Timeweb $timeweb_path returned unsafe Cache-Control: ${timeweb_cache_control:-missing}"
done

timeweb_headers="$(curl --noproxy '*' --silent --show-error --connect-timeout 5 --max-time 20 \
  --head -H 'Accept-Encoding: gzip' "https://$timeweb_domain$known_card_path" 2>/dev/null || true)"
[[ "$(awk '/^HTTP\// { code=$2 } END { print code }' <<< "$timeweb_headers")" == 200 ]] \
  || fail "Timeweb card-image fallback is unavailable"
[[ "$(header_value Content-Type <<< "$timeweb_headers")" == image/webp ]] \
  || fail "Timeweb card-image fallback returned an unexpected content type"
timeweb_card_cache_control="${timeweb_headers,,}"
[[ "$timeweb_card_cache_control" == *"cache-control: public, max-age=2592000, immutable"* ]] \
  || fail "Timeweb card-image fallback returned an unsafe Cache-Control policy"

if (( failures > 0 )); then exit 1; fi
printf 'GeoDNS, regional edge and CDN health OK at %s\n' "$(date -u +%FT%TZ)"
