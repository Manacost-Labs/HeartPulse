#!/usr/bin/env bash
set -euo pipefail

application_domain="${HEARTHPULSE_MONITOR_DOMAIN:-hearthpulse.net}"
www_domain="${HEARTHPULSE_MONITOR_WWW_DOMAIN:-www.hearthpulse.net}"
cdn_domain="${HEARTHPULSE_MONITOR_CDN_DOMAIN:-cdn.hearthpulse.net}"
legacy_domain="${HEARTHPULSE_MONITOR_LEGACY_DOMAIN:-arena.hs-manacost.ru}"
legacy_cdn_domain="${HEARTHPULSE_MONITOR_LEGACY_CDN_DOMAIN:-cdn.arena.hs-manacost.ru}"
known_card_path="${HEARTHPULSE_MONITOR_CARD_PATH:-/api/card-image/DINO_410/full.webp}"
edges=("limburg:162.19.220.14" "moscow:194.67.92.242" "novosibirsk:186.246.28.244")
expected_ipv4="$(printf '%s\n' "${edges[@]#*:}" | sort -u)"

failures=0
fail() {
	printf 'FAIL: %s\n' "$*" >&2
	failures=$((failures + 1))
}

header_value() {
	local name="$1"
	awk -v wanted="$name" 'BEGIN { IGNORECASE=1 } {
    separator = index($0, ":")
    key = separator ? substr($0, 1, separator - 1) : ""
    if (tolower(key) == tolower(wanted)) {
      value = substr($0, separator + 1)
      sub(/^[[:space:]]+/, "", value)
    }
  } END { sub(/\r$/, "", value); print value }'
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

resolved_body() {
	local host="$1" address="$2" path="$3"
	curl --noproxy '*' --silent --show-error --connect-timeout 5 --max-time 20 \
		--resolve "$host:443:$address" "https://$host$path"
}

for host in "$application_domain" "$www_domain" "$cdn_domain"; do
	ipv4_answers="$(dig +short @1.1.1.1 "$host" A |
		awk '/^[0-9]+(\.[0-9]+){3}$/' | sort -u)"
	ipv6_answers="$(dig +short @1.1.1.1 "$host" AAAA |
		awk 'index($0, ":") > 0' | sort -u)"
	[[ "$ipv4_answers" == "$expected_ipv4" ]] ||
		fail "$host DNS returned an unsafe IPv4 set: ${ipv4_answers:-empty}"
	[[ -z "$ipv6_answers" ]] ||
		fail "$host DNS unexpectedly exposed IPv6: $ipv6_answers"
done

for edge_entry in "${edges[@]}"; do
	region="${edge_entry%%:*}"
	edge="${edge_entry#*:}"

	app_headers="$(resolved_headers "$application_domain" "$edge" / 2>/dev/null || true)"
	app_status="$(http_status <<<"$app_headers")"
	app_robots="$(header_value X-Robots-Tag <<<"$app_headers")"
	app_hsts="$(header_value Strict-Transport-Security <<<"$app_headers")"
	[[ "$app_status" == 200 ]] || fail "$region $edge application returned HTTP ${app_status:-unavailable}"
	[[ "$app_robots" != *noindex* ]] || fail "$region $edge canonical application is still noindex"
	[[ "$app_hsts" == "max-age=31536000" ]] ||
		fail "$region $edge application returned unsafe HSTS: ${app_hsts:-missing}"

	www_headers="$(resolved_headers "$www_domain" "$edge" '/migration-check?region=test' 2>/dev/null || true)"
	www_status="$(http_status <<<"$www_headers")"
	www_location="$(header_value Location <<<"$www_headers")"
	[[ "$www_status" == 301 ]] || fail "$region $edge www returned HTTP ${www_status:-unavailable}"
	[[ "$www_location" == 'https://hearthpulse.net/migration-check?region=test' ]] ||
		fail "$region $edge www redirect target is unsafe: ${www_location:-missing}"

	health_status="$(resolved_status "$application_domain" "$edge" /_proxy_health 2>/dev/null || printf 000)"
	[[ "$health_status" == 200 ]] || fail "$region $edge canonical health returned HTTP $health_status"

	robots_body="$(resolved_body "$application_domain" "$edge" /robots.txt 2>/dev/null || true)"
	[[ "$robots_body" == *'Sitemap: https://hearthpulse.net/sitemap.xml'* ]] ||
		fail "$region $edge robots.txt has no HearthPulse sitemap"

	card_headers="$(resolved_headers "$cdn_domain" "$edge" "$known_card_path" 2>/dev/null || true)"
	card_status="$(http_status <<<"$card_headers")"
	card_type="$(header_value Content-Type <<<"$card_headers")"
	card_cors="$(header_value Access-Control-Allow-Origin <<<"$card_headers")"
	[[ "$card_status" == 200 ]] || fail "$region $edge CDN card returned HTTP ${card_status:-unavailable}"
	[[ "$card_type" == image/* ]] || fail "$region $edge CDN card returned ${card_type:-no content type}"
	[[ "$card_cors" == '*' ]] || fail "$region $edge CDN card returned unsafe CORS: ${card_cors:-missing}"

	private_status="$(resolved_status "$cdn_domain" "$edge" /api/subscription/status 2>/dev/null || printf 000)"
	[[ "$private_status" == 404 ]] || fail "$region $edge CDN exposed private API with HTTP $private_status"

	legacy_headers="$(resolved_headers "$legacy_domain" "$edge" '/standard/cards/?migration=1' 2>/dev/null || true)"
	legacy_status="$(http_status <<<"$legacy_headers")"
	legacy_location="$(header_value Location <<<"$legacy_headers")"
	[[ "$legacy_status" == 301 ]] || fail "$region $edge $legacy_domain returned HTTP ${legacy_status:-unavailable}"
	[[ "$legacy_location" == 'https://hearthpulse.net/standard/cards/?migration=1' ]] ||
		fail "$region $edge $legacy_domain redirect target is unsafe: ${legacy_location:-missing}"

	legacy_cdn_headers="$(resolved_headers "$legacy_cdn_domain" "$edge" "$known_card_path?migration=1" 2>/dev/null || true)"
	legacy_cdn_status="$(http_status <<<"$legacy_cdn_headers")"
	legacy_cdn_location="$(header_value Location <<<"$legacy_cdn_headers")"
	[[ "$legacy_cdn_status" == 301 ]] || fail "$region $edge legacy CDN returned HTTP ${legacy_cdn_status:-unavailable}"
	[[ "$legacy_cdn_location" == "https://cdn.hearthpulse.net$known_card_path?migration=1" ]] ||
		fail "$region $edge legacy CDN redirect target is unsafe: ${legacy_cdn_location:-missing}"
done

if ((failures > 0)); then exit 1; fi
printf 'HearthPulse canonical DNS, TLS, regional application, legacy redirects and CDN checks passed at %s\n' "$(date -u +%FT%TZ)"
