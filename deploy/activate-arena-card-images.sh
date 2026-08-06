#!/usr/bin/env bash
set -euo pipefail

root="${ARENA_CARD_IMAGE_ROOT:-/srv/arena/card-images}"
minimum_files="${ARENA_CARD_IMAGE_MIN_FILES:-10000}"
minimum_bytes="${ARENA_CARD_IMAGE_MIN_BYTES:-400000000}"
skip_reload="${ARENA_CARD_IMAGE_SKIP_RELOAD:-0}"
install_owner="${ARENA_CARD_IMAGE_OWNER-root}"
install_group="${ARENA_CARD_IMAGE_GROUP-root}"
mode="${1:-}"
version="${2:-}"

if [[ "$root" != /* || "$root" == / ]]; then
  echo "Invalid card image root" >&2
  exit 2
fi
if [[ ! "$version" =~ ^card_img_v[0-9]+(_[A-Za-z0-9_]+)?$ ]]; then
  echo "Invalid card image cache version" >&2
  exit 2
fi
if [[ ! "$minimum_files" =~ ^[0-9]+$ || ! "$minimum_bytes" =~ ^[0-9]+$ ]]; then
  echo "Invalid card image publication thresholds" >&2
  exit 2
fi

version_root="$root/versions/$version"
raw="$version_root/raw"
manifest="$version_root/manifest.json"

publication_is_current() {
  [[ -d "$raw" && -f "$manifest" && -L "$root/current" ]] || return 1
  local active
  active="$(readlink -f "$root/current")"
  [[ "$active" == "$version_root"/serve-* && -d "$active" ]] || return 1

  local source_count served_count
  source_count="$(find "$raw" -maxdepth 1 -type f -name "*-${version}.webp" | wc -l)"
  served_count="$(find "$active" -maxdepth 1 -type f -name '*.webp' | wc -l)"
  [[ "$source_count" == "$served_count" ]] || return 1
  [[ -z "$(find "$raw" -maxdepth 1 -type f -name "*-${version}.webp" -newer "$manifest" -print -quit)" ]]
}

reload_nginx() {
  if [[ "$skip_reload" == 1 ]]; then
    return
  fi
  nginx -t
  systemctl reload nginx
}

install_directory() {
  local arguments=(-d -m 0755)
  if [[ -n "$install_owner" ]]; then arguments+=(-o "$install_owner"); fi
  if [[ -n "$install_group" ]]; then arguments+=(-g "$install_group"); fi
  install "${arguments[@]}" "$@"
}

case "$mode" in
  prepare)
    install_directory "$root" "$root/versions" "$version_root" "$raw"
    ;;
  current)
    publication_is_current
    ;;
  activate)
    [[ -d "$raw" ]] || { echo "Card image raw directory is missing" >&2; exit 1; }
    count="$(find "$raw" -maxdepth 1 -type f -name "*-${version}.webp" | wc -l)"
    bytes="$(du -sb "$raw" | awk '{print $1}')"
    if (( count < minimum_files || bytes < minimum_bytes )); then
      echo "Refusing incomplete card image publication: files=$count bytes=$bytes" >&2
      exit 1
    fi

    generation_name="serve-$(date -u +%Y%m%dT%H%M%SZ)-$$"
    generation="$version_root/$generation_name"
    install_directory "$generation"
    cleanup_generation=1
    trap 'if [[ "${cleanup_generation:-0}" == 1 ]]; then rm -rf -- "$generation"; fi' EXIT

    linked=0
    while IFS= read -r -d '' source; do
      filename="${source##*/}"
      if [[ "$filename" =~ ^(.+)-(thumb|full)-(blizzard|fallback|placeholder)-${version}\.webp$ ]]; then
        card_id="${BASH_REMATCH[1]}"
        variant="${BASH_REMATCH[2]}"
        image_source="${BASH_REMATCH[3]}"
        ln -- "$source" "$generation/${card_id}-${variant}-${image_source}.webp"
        linked=$((linked + 1))
      fi
    done < <(find "$raw" -maxdepth 1 -type f -name "*-${version}.webp" -print0)

    if (( linked != count )); then
      echo "Refusing incomplete normalized cache: sourceFiles=$count servedFiles=$linked" >&2
      exit 1
    fi

    temporary_link="$root/.current-${version}-$$"
    ln -s "versions/$version/$generation_name" "$temporary_link"
    mv -Tf "$temporary_link" "$root/current"

    manifest_temporary="$version_root/.manifest-$$.json"
    printf '{"version":"%s","sourceFiles":%s,"servedFiles":%s,"publishedAt":"%s","generation":"%s"}\n' \
      "$version" "$count" "$linked" "$(date -u +%FT%TZ)" "$generation_name" > "$manifest_temporary"
    mv -f "$manifest_temporary" "$manifest"
    cleanup_generation=0
    trap - EXIT
    reload_nginx
    ;;
  *)
    echo "Usage: $0 prepare|current|activate CARD_IMAGE_VERSION" >&2
    exit 2
    ;;
esac
