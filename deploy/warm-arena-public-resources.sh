#!/usr/bin/env bash
# Warm the HearthPulse edge caches through one pinned edge node.
#
# Installed as /usr/local/sbin/warm-arena-public-resources and run by the
# arena-public-resource-warm*.service units, one unit per edge IP. Every request
# is pinned with --resolve, so DNS membership does not decide which edge is
# warmed. A region listed in the root-managed quarantine file is skipped.
set -euo pipefail

edge_ip="${1:-162.19.220.14}"
case "$edge_ip" in
  162.19.220.14) edge_name="eu-limburg"; edge_region="limburg" ;;
  194.67.92.242) edge_name="ru-moscow"; edge_region="moscow" ;;
  186.246.28.244) edge_name="ru-novosibirsk"; edge_region="novosibirsk" ;;
  *) echo "Unsupported edge IP: $edge_ip" >&2; exit 2 ;;
esac

site_host="${ARENA_WARM_SITE_HOST:-hearthpulse.net}"
cdn_host="${ARENA_WARM_CDN_HOST:-cdn.hearthpulse.net}"
release_root="${ARENA_WARM_RELEASE_ROOT:-/var/www/koloda/data/www/hs-arena.ru/current}"
server_data="${ARENA_WARM_SERVER_DATA:-/var/www/koloda/data/www/hs-arena.ru/shared/server-data}"
quarantine_file="${ARENA_WARM_QUARANTINE_FILE:-/etc/hs-arena/hearthpulse-shadow-monitor.env}"
state_root="${ARENA_WARM_STATE_ROOT:-/var/lib/arena-edge/public-warm}/$edge_name"
concurrency="${ARENA_WARM_CONCURRENCY:-8}"
media_concurrency="${ARENA_WARM_MEDIA_CONCURRENCY:-4}"
# Stay well inside the unit's TimeoutStartSec (45 min) so the run always
# finishes with a report instead of being killed by systemd.
deadline_seconds="${ARENA_WARM_DEADLINE_SECONDS:-2400}"
release_dist="$release_root/dist"
next_root="$release_root/apps/public-web/.next"

quarantined_regions() {
  [[ -r "$quarantine_file" ]] || return 0
  sed -nE 's/^[[:space:]]*HEARTHPULSE_MONITOR_QUARANTINED_REGIONS?=["'\'']?([a-z,]*)["'\'']?[[:space:]]*$/\1/p' \
    "$quarantine_file" | tr ',' '\n'
}
if quarantined_regions | grep -qxF "$edge_region"; then
  echo "Arena public-resource warm skipped: edge=$edge_name is quarantined in $quarantine_file"
  exit 0
fi

edge_curl() {
  curl --noproxy '*' --silent --show-error --connect-timeout 5 --max-time 20 \
    --resolve "${site_host}:443:${edge_ip}" --resolve "${cdn_host}:443:${edge_ip}" \
    -A 'Mozilla/5.0 (compatible; HearthPulseEdgeWarm/2.0)' "$@"
}

# Fail fast on an unreachable edge instead of letting every request time out.
probe_status="$(edge_curl --output /dev/null --write-out '%{http_code}' \
  "https://${site_host}/favicon.ico" 2>&1 || true)"
if [[ "$probe_status" != 200 ]]; then
  echo "Edge $edge_name ($edge_ip) is unreachable for https://${site_host}: ${probe_status}" >&2
  exit 1
fi

run_id="$(date -u +%Y%m%dT%H%M%SZ)"
work_dir="$state_root/runs/$run_id"
install -d -m 0750 "$work_dir"
fast="$work_dir/fast.txt"
media="$work_dir/media.txt"
raw="$work_dir/raw.txt"
success="$work_dir/success.txt"
failed="$work_dir/failed.txt"
: > "$fast"; : > "$media"; : > "$raw"; : > "$success"; : > "$failed"

# 1. Hashed Next.js assets referenced by the current build only. Older build
#    directories stay on disk for rollback but are not requested by pages.
if [[ -s "$next_root/BUILD_ID" ]]; then
  build_id="$(tr -d '[:space:]' < "$next_root/BUILD_ID")"
  {
    cat "$next_root/build-manifest.json" 2>/dev/null || true
    find "$next_root/server/app" -name '*_client-reference-manifest.js' -exec cat {} + 2>/dev/null || true
    printf '"static/%s/_buildManifest.js" "static/%s/_ssgManifest.js"\n' "$build_id" "$build_id"
  } | grep -oE 'static/[A-Za-z0-9_-]+/[A-Za-z0-9._/~@+-]+\.(js|css|woff2?|png|svg|webp|avif|jpe?g|ico)' \
    | sort -u | while IFS= read -r asset; do
      if [[ -f "$next_root/$asset" ]]; then printf '%s\t/_next/%s\n' "$site_host" "$asset"; fi
    done >> "$fast"
fi

# 2. Public images and icons from the release that the edge vhost caches.
if [[ -d "$release_dist" ]]; then
  (cd "$release_dist" && find ad archetype-art auth-icons bg-legacy class_icon constructed-filter-icons \
      generated main_assets site-icons source-logos wallpaper -type f 2>/dev/null; \
    find . -maxdepth 1 -type f -regextype posix-extended \
      -regex '\./(apple-touch-icon\.png|arena-logo-icon(-256)?\.webp|hearthpulse-logo\.webp|card-format-(standard|wild)\.webp|favicon(-16|-32|-96|-192|_shield)?\.(ico|png|svg))' \
      -printf '%P\n') \
    | { grep -Ei '\.(png|jpe?g|webp|avif|gif|svg|ico)$' || true; } | { grep -Ev '[[:space:]]' || true; } \
    | sed -E "s#^#${site_host}\t/#" >> "$fast"
fi

# 3. Card images through the CDN host, using the server's canonical version.
card_version="$(node --input-type=module -e \
  "import('${release_root}/build/server/cardImageCache.js').then(m => process.stdout.write(m.CARD_IMAGE_CACHE_VERSION))" \
  2>/dev/null || true)"
if [[ "$card_version" =~ ^card_img_v[0-9]+(_[A-Za-z0-9_]+)?$ && -d "$server_data/card-images" ]]; then
  find "$server_data/card-images" -maxdepth 1 -type f -name "*-blizzard-${card_version}.webp" -printf '%f\n' \
    | sed -nE "s#^([A-Za-z0-9_]+)-(thumb|full)-blizzard-${card_version}\\.webp\$#${cdn_host}\t/api/card-image/\\1/\\2.webp?v=${card_version}#p" \
    >> "$fast"
else
  echo "Card image version unavailable; card images are not warmed" >&2
fi

# 4. Same-origin and CDN media that public pages actually reference: article
#    covers, banners, hero skins, catalog card URLs with their page version.
pages="$work_dir/pages.txt"
edge_curl "https://${site_host}/sitemaps/static.xml" 2>/dev/null \
  | grep -oE "<loc>https://${site_host//./\\.}/[^<]*" | sed -E "s#^<loc>https://${site_host//./\\.}##" \
  | head -n 80 > "$pages" || true
[[ -s "$pages" ]] || printf '/\n/articles/\n' > "$pages"
while IFS= read -r page; do
  edge_curl --compressed "https://${site_host}${page}" 2>/dev/null \
    | sed -e 's/\\u0026/\&/g' -e 's/&amp;/\&/g' -e 's/\\"/"/g' \
    | grep -oE "(https://(${site_host//./\\.}|${cdn_host//./\\.}))?/(api/(article-cover|public-resource|card-image)|uploads|_next/static|wallpaper|class_icon|bg-legacy|archetype-art|generated|main_assets|site-icons|source-logos)[^\"'\\\\[:space:],<>)]*" \
    || true
done < "$pages" | sort -u | while IFS= read -r url; do
  host="$site_host"; path="$url"
  if [[ "$url" == https://* ]]; then
    host="${url#https://}"; host="${host%%/*}"; path="/${url#https://*/}"
  fi
  # The client serves every card image from the CDN host.
  [[ "$path" == /api/card-image/* ]] && host="$cdn_host"
  if [[ "$path" =~ ^/api/(article-cover|public-resource)/? ]]; then
    printf '%s\t%s\n' "$host" "$path" >> "$media"
  else
    printf '%s\t%s\n' "$host" "$path" >> "$fast"
  fi
done

# 5. Proxied third-party media referenced by release bundles and server data
#    (full art, battleground images, wiki/HSReplay images).
scan_targets=("$release_dist" "$server_data")
grep_options=(-RhoaE --include='*.json' --include='*.js' --include='*.mjs'
  --include='*.html' --include='*.css' --include='*.txt' --include='*.xml')
grep "${grep_options[@]}" '/api/public-resource/[A-Za-z0-9._~!$&()*+,;=:@%/?=-]+' "${scan_targets[@]}" 2>/dev/null >> "$raw" || true
collect_origin() {
  local host_pattern="$1" source_key="$2" path_prefix="$3"
  grep "${grep_options[@]}" "https://${host_pattern}${path_prefix}[^\"'[:space:]<>]+" "${scan_targets[@]}" 2>/dev/null \
    | sed -E "s#^https://${host_pattern}#/api/public-resource/${source_key}#" >> "$raw" || true
}
collect_origin 'hearthstone\.wiki\.gg' wiki '/images/'
collect_origin 'db\.kolodahs\.ru' db '/uploads/'
collect_origin 'bg\.kolodahearthstone\.ru' bg '/assset/'
collect_origin 'art\.hearthstonejson\.com' hsjson '/v1/'
collect_origin 'api\.hearthstonejson\.com' hsjson-api '/v1/'
collect_origin 'static\.hsreplay\.net' hsreplay '/static/'
sed -E 's/[),.;]+$//' "$raw" \
  | { grep -Ev '\$|[{}]|[[:space:]]|\\' || true; } \
  | { grep -Ei '\.(png|jpe?g|webp|gif|avif|ico|bmp|mp4|webm|json)(\?|$)' || true; } \
  | sed -E "s#^#${site_host}\t#" >> "$media"

sort -u -o "$fast" "$fast"
sort -u -o "$media" "$media"
comm -23 "$fast" "$media" > "$fast.tmp" && mv "$fast.tmp" "$fast"
if [[ "${ARENA_WARM_DRY_RUN:-0}" == 1 ]]; then
  echo "Dry run: edge=$edge_name fast=$(wc -l < "$fast") media=$(wc -l < "$media") lists=$work_dir"
  exit 0
fi

deadline_at=$(( $(date +%s) + deadline_seconds ))
warm_one() {
  local host="$1" path="$2" pace="$3" result status cache
  if (( $(date +%s) >= deadline_at )); then
    printf 'deadline %s%s\n' "$host" "$path" >> "$failed"
    return 0
  fi
  result="$(edge_curl --retry 1 --retry-delay 1 \
    -H 'Accept: image/avif,image/webp,image/apng,*/*;q=0.8' \
    -H 'Accept-Encoding: gzip, deflate, br, zstd' \
    --output /dev/null --write-out '%{http_code} %header{x-proxy-cache}' \
    "https://${host}${path}" 2>/dev/null || true)"
  status="${result%% *}"
  cache="${result#* }"
  [[ -n "$status" ]] || status=000
  # Uncached origin media shares the public-media rate limit with visitors.
  [[ "$pace" == media ]] && sleep 0.45
  if [[ "$status" == 200 || "$status" == 206 ]]; then
    printf '%s %s%s\n' "${cache:--}" "$host" "$path" >> "$success"
  else
    printf '%s %s%s\n' "$status" "$host" "$path" >> "$failed"
  fi
}
warm_entry() {
  local host path
  IFS=$'\t' read -r host path <<< "$2"
  warm_one "$host" "$path" "$1"
}
export -f edge_curl warm_one warm_entry
export edge_ip site_host cdn_host deadline_at success failed

tr '\n' '\0' < "$fast" | xargs -0 -r -P "$concurrency" -n 1 bash -c 'warm_entry fast "$1"' _
tr '\n' '\0' < "$media" | xargs -0 -r -P "$media_concurrency" -n 1 bash -c 'warm_entry media "$1"' _

# Retry transient transport/rate-limit/server failures once, slowly.
if [[ -s "$failed" ]]; then
  retry="$work_dir/retry.txt"
  cp "$failed" "$work_dir/failed-first-pass.txt"
  awk '$1 == "000" || $1 == "429" || $1 ~ /^5[0-9][0-9]$/ {print $2}' "$work_dir/failed-first-pass.txt" \
    | sed -E 's#^([^/]+)(/.*)$#\1\t\2#' | sort -u > "$retry"
  awk '!($1 == "000" || $1 == "429" || $1 ~ /^5[0-9][0-9]$/)' "$work_dir/failed-first-pass.txt" > "$failed"
  tr '\n' '\0' < "$retry" | xargs -0 -r -P 2 -n 1 bash -c 'warm_entry media "$1"' _
fi

total=$(( $(wc -l < "$fast") + $(wc -l < "$media") ))
ok="$(wc -l < "$success")"
bad="$(wc -l < "$failed")"
cache_summary="$(cut -d' ' -f1 "$success" | sort | uniq -c | awk '{printf "%s%s=%s", sep, $2, $1; sep=","}')"
printf 'edge=%s\ntotal=%s\nok=%s\nfailed=%s\ncache=%s\nfinished_at=%s\n' \
  "$edge_name" "$total" "$ok" "$bad" "$cache_summary" "$(date -u +%FT%TZ)" > "$work_dir/summary"
ln -sfn "$work_dir" "$state_root/latest"
find "$state_root/runs" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr | tail -n +6 | cut -d' ' -f2- | xargs -r rm -rf --

echo "Arena public-resource warm complete: edge=$edge_name total=$total ok=$ok failed=$bad cache=${cache_summary:-none}"
if (( total == 0 || ok * 100 / total < 80 )); then
  sed -n '1,30p' "$failed" >&2
  exit 1
fi
