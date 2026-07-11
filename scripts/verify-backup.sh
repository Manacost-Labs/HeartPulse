#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

BACKUP_DIR=${HS_ARENA_BACKUP_DIR:-/var/backups/hs-arena}
PASSPHRASE_FILE=${HS_ARENA_BACKUP_PASSPHRASE_FILE:-/etc/hs-arena/backup-passphrase}
backup_file=${1:-}

for command in sqlite3 tar gpg sha256sum find; do
  command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 1; }
done

if [[ -z "$backup_file" ]]; then
  backup_file=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'hs-arena-*.tar.gz.gpg' -printf '%T@ %p\n' \
    | sort -nr | head -1 | cut -d' ' -f2-)
fi

[[ -n "$backup_file" && -r "$backup_file" ]] || { echo "encrypted backup is missing" >&2; exit 1; }
[[ -r "$backup_file.sha256" ]] || { echo "backup checksum is missing" >&2; exit 1; }
[[ -r "$PASSPHRASE_FILE" ]] || { echo "backup passphrase file is missing" >&2; exit 1; }

(
  cd "$(dirname "$backup_file")"
  sha256sum -c "$(basename "$backup_file").sha256"
)

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/hs-arena-restore.XXXXXX")
restore_dir="$work_dir/payload"
cleanup() { rm -rf "$work_dir"; }
trap cleanup EXIT
export GNUPGHOME="$work_dir/gnupg"
mkdir -m 700 "$GNUPGHOME" "$restore_dir"

gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$PASSPHRASE_FILE" \
  --decrypt "$backup_file" \
  | tar -C "$restore_dir" -xzf -

(
  cd "$restore_dir"
  sha256sum -c MANIFEST.sha256
)

integrity=$(sqlite3 "$restore_dir/ecosystem/users.sqlite" 'PRAGMA integrity_check;')
[[ "$integrity" == 'ok' ]] || { echo "restored SQLite integrity check failed" >&2; exit 1; }

for required in winrates.json tierlist.json legendaries.json; do
  [[ -s "$restore_dir/server-data/$required" ]] || { echo "required snapshot is missing: $required" >&2; exit 1; }
done

echo "verified restore: $(basename "$backup_file")"
