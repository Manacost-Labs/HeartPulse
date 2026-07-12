#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

PASSPHRASE_FILE=${HS_ARENA_BACKUP_PASSPHRASE_FILE:-/etc/hs-arena/backup-passphrase}
backup_file=${1:-}
target_root=${2:-}

for command in sqlite3 tar gpg sha256sum find mktemp mv; do
  command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 1; }
done

[[ -n "$backup_file" && -r "$backup_file" ]] || { echo "encrypted backup is missing" >&2; exit 1; }
[[ -r "$backup_file.sha256" ]] || { echo "backup checksum is missing" >&2; exit 1; }
[[ -r "$PASSPHRASE_FILE" ]] || { echo "backup passphrase file is missing" >&2; exit 1; }
[[ -n "$target_root" && "$target_root" = /* && "$target_root" != / ]] \
  || { echo "restore target must be a non-root absolute path" >&2; exit 1; }

target_parent=$(dirname "$target_root")
mkdir -p "$target_parent"
if [[ -e "$target_root" ]]; then
  [[ -d "$target_root" ]] || { echo "restore target exists and is not a directory" >&2; exit 1; }
  [[ -z "$(find "$target_root" -mindepth 1 -maxdepth 1 -print -quit)" ]] \
    || { echo "restore target must be empty" >&2; exit 1; }
  rmdir "$target_root"
fi

(
  cd "$(dirname "$backup_file")"
  sha256sum --quiet -c "$(basename "$backup_file").sha256"
)

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/hs-arena-recovery.XXXXXX")
staging_dir=$(mktemp -d "$target_parent/.hs-arena-recovery.XXXXXX")
committed=0
cleanup() {
  rm -rf "$work_dir"
  if [[ "$committed" != 1 ]]; then rm -rf "$staging_dir"; fi
}
trap cleanup EXIT

export GNUPGHOME="$work_dir/gnupg"
mkdir -m 700 "$GNUPGHOME"
archive="$work_dir/payload.tar.gz"
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$PASSPHRASE_FILE" \
  --output "$archive" --decrypt "$backup_file"

while IFS= read -r entry; do
  normalized=${entry#./}
  [[ -z "$normalized" ]] && continue
  [[ "$normalized" != /* && "$normalized" != '..' \
    && "$normalized" != ../* && "$normalized" != */../* && "$normalized" != */.. ]] \
    || { echo "unsafe archive path: $entry" >&2; exit 1; }
done < <(tar -tzf "$archive")

tar -C "$staging_dir" -xzf "$archive"
(
  cd "$staging_dir"
  sha256sum --quiet -c MANIFEST.sha256
)

integrity=$(sqlite3 "$staging_dir/ecosystem/users.sqlite" 'PRAGMA integrity_check;')
[[ "$integrity" == 'ok' ]] || { echo "restored SQLite integrity check failed" >&2; exit 1; }
for required in winrates.json tierlist.json legendaries.json; do
  [[ -s "$staging_dir/server-data/$required" ]] \
    || { echo "required snapshot is missing: $required" >&2; exit 1; }
done

mv "$staging_dir" "$target_root"
committed=1
echo "$target_root"
