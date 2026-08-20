#!/usr/bin/env bash
set -euo pipefail

application_domain="${HEARTHPULSE_MONITOR_DOMAIN:-hearthpulse.net}"
www_domain="${HEARTHPULSE_MONITOR_WWW_DOMAIN:-www.hearthpulse.net}"
cdn_domain="${HEARTHPULSE_MONITOR_CDN_DOMAIN:-cdn.hearthpulse.net}"
known_card_path="${HEARTHPULSE_MONITOR_CARD_PATH:-/api/card-image/DINO_410/full.webp}"
edges=("162.19.220.14" "194.67.92.242" "186.246.28.244")
expected_ipv4="$(printf '%s\n' "${edges[@]}" | sort -u)"

failures=0
fail() {
  printf 'FAIL: %s\n' "$*" >&2
  failures=$((failures + 1))
}

header_value() {
  local name="$1"
  awk -F ': *' -v wanted="$name" 'BEGIN { IGNORECASE=1 } tolower($1) == tolower(wanted) { value=$2 } END { sub(/\r$/, "", value); print value }'
}

http_status() {
  awk '/^HTTP\// { code=$2 } END { sub(/\r$/, "", code); print code }'
}

resolved_headers() {
  local host="$1" address="$2" path="$3"
  curl --noproxy '*' --silent --show-error --connect-timeout 5 --max-time 20 \
    --resolve "$host:443:$address" --head "https://$host$path"
}

resolved_status() {
  local host="$1" address="$2" path="$3"
  curl --noproxy '*' --silent --show-error --connect-timeout 5 --max-time 20 \
    --resolve "$host:443:$address" --output /dev/null --write-out '%{http_code}' \
    "https://$host$path"
}

for host in "$application_domain" "$www_domain" "$cdn_domain"; do
  ipv4_answers="$(dig +short @1.1.1.1 "$host" A \
    | awk '/^[0-9]+(\.[0-9]+){3}$/' | sort -u)"
  ipv6_answers="$(dig +short @1.1.1.1 "$host" AAAA \
    | awk 'index($0, ":") > 0' | sort -u)"
  [[ "$ipv4_answers" == "$expected_ipv4" ]] \
    || fail "$host DNS returned an unsafe IPv4 set: ${ipv4_answers:-empty}"
  [[ -z "$ipv6_answers" ]] \
    || fail "$host DNS unexpectedly exposed IPv6: $ipv6_answers"
done

for edge in "${edges[@]}"; do
  for host in "$application_domain" "$www_domain"; do
    app_headers="$(resolved_headers "$host" "$edge" / 2>/dev/null || true)"
    app_status="$(http_status <<< "$app_headers")"
    app_robots="$(header_value X-Robots-Tag <<< "$app_headers")"
    app_hsts="$(header_value Strict-Transport-Security <<< "$app_headers")"
    [[ "$app_status" == 200 ]] || fail "$edge $host returned HTTP ${app_status:-unavailable}"
    [[ "$app_robots" == *noindex* ]] || fail "$edge $host is missing X-Robots-Tag noindex"
    [[ "$app_hsts" == "max-age=300" ]] \
      || fail "$edge $host returned unsafe HSTS: ${app_hsts:-missing}"
  done

  health_status="$(resolved_status "$application_domain" "$edge" /_proxy_health 2>/dev/null || printf 000)"
  [[ "$health_status" == 200 ]] || fail "$edge shadow health returned HTTP $health_status"

  card_headers="$(resolved_headers "$cdn_domain" "$edge" "$known_card_path" 2>/dev/null || true)"
  card_status="$(http_status <<< "$card_headers")"
  card_type="$(header_value Content-Type <<< "$card_headers")"
  card_robots="$(header_value X-Robots-Tag <<< "$card_headers")"
  card_cors="$(header_value Access-Control-Allow-Origin <<< "$card_headers")"
  [[ "$card_status" == 200 ]] || fail "$edge CDN card returned HTTP ${card_status:-unavailable}"
  [[ "$card_type" == image/* ]] || fail "$edge CDN card returned ${card_type:-no content type}"
  [[ "$card_robots" == *noindex* ]] || fail "$edge CDN card is missing X-Robots-Tag noindex"
  [[ "$card_cors" == "*" ]] || fail "$edge CDN card returned unsafe CORS: ${card_cors:-missing}"

  private_status="$(resolved_status "$cdn_domain" "$edge" /api/subscription/status 2>/dev/null || printf 000)"
  [[ "$private_status" == 404 ]] || fail "$edge CDN exposed private API with HTTP $private_status"
done

if (( failures > 0 )); then exit 1; fi
printf 'HearthPulse shadow DNS, TLS, regional application and CDN checks passed at %s\n' "$(date -u +%FT%TZ)"
