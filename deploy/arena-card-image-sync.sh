#!/usr/bin/env bash
set -euo pipefail

source_root="${ARENA_CARD_IMAGE_SOURCE_ROOT:-/var/www/koloda/data/www/hs-arena.ru/shared/server-data/card-images}"
release_root="${ARENA_CARD_IMAGE_RELEASE_ROOT:-/var/www/koloda/data/www/hs-arena.ru/current}"
known_hosts="${ARENA_CARD_IMAGE_KNOWN_HOSTS:-/home/debian/.ssh/known_hosts}"
edge_specs=(
  "debian@162.19.220.14|/home/debian/.ssh/koloda_proxy_ed25519"
  "root@194.67.92.242|/home/debian/.ssh/koloda_proxy_ed25519"
  "root@186.246.28.244|/root/.ssh/koloda_proxy_ru-novosibirsk_ed25519"
)

version="$(node --input-type=module -e \
  "import('${release_root}/build/server/cardImageCache.js').then(m => process.stdout.write(m.CARD_IMAGE_CACHE_VERSION))")"
if [[ ! "$version" =~ ^card_img_v[0-9]+(_[A-Za-z0-9_]+)?$ ]]; then
  echo "Invalid production card image cache version: $version" >&2
  exit 1
fi

failures=0
for edge_spec in "${edge_specs[@]}"; do
  IFS='|' read -r edge identity <<< "$edge_spec"
  ssh_options=(
    -i "$identity"
    -o BatchMode=yes
    -o StrictHostKeyChecking=yes
    -o UserKnownHostsFile="$known_hosts"
    -o ConnectTimeout=10
  )
  if ! ssh "${ssh_options[@]}" "$edge" \
      "sudo /usr/local/sbin/activate-arena-card-images prepare '$version'"; then
    echo "Card image prepare failed on $edge" >&2
    failures=$((failures + 1))
    continue
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
    failures=$((failures + 1))
    continue
  fi

  if ! grep -Eq '^(>|\*deleting)' "$rsync_log" && ssh "${ssh_options[@]}" "$edge" \
      "sudo /usr/local/sbin/activate-arena-card-images current '$version'"; then
    rm -f -- "$rsync_log"
    echo "Card images already current on $edge"
    continue
  fi
  rm -f -- "$rsync_log"

  if ! ssh "${ssh_options[@]}" "$edge" \
      "sudo /usr/local/sbin/activate-arena-card-images activate '$version'"; then
    echo "Card image activation failed on $edge" >&2
    failures=$((failures + 1))
  fi
done

exit "$failures"
