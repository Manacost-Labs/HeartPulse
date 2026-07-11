#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

BACKUP_DIR=${HS_ARENA_BACKUP_DIR:-/var/backups/hs-arena}
PASSPHRASE_FILE=${HS_ARENA_BACKUP_PASSPHRASE_FILE:-/etc/hs-arena/backup-passphrase}
SERVER_DATA_DIR=${SERVER_DATA_DIR:-/var/www/koloda/data/www/hs-arena.ru/shared/server-data}
ECOSYSTEM_DIR=${ECOSYSTEM_DIR:-/var/lib/manacost-ecosystem}
RETENTION_DAYS=${HS_ARENA_BACKUP_RETENTION_DAYS:-14}
LOCK_FILE=${HS_ARENA_BACKUP_LOCK_FILE:-/run/lock/hs-arena-backup.lock}

for command in flock sqlite3 tar gpg sha256sum find; do
  command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 1; }
done

[[ -d "$SERVER_DATA_DIR" ]] || { echo "server data directory is missing" >&2; exit 1; }
[[ -r "$ECOSYSTEM_DIR/users.sqlite" ]] || { echo "ecosystem database is missing" >&2; exit 1; }
[[ -r "$PASSPHRASE_FILE" ]] || { echo "backup passphrase file is missing" >&2; exit 1; }
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || { echo "retention days must be an integer" >&2; exit 1; }

mkdir -p "$BACKUP_DIR" "$(dirname "$LOCK_FILE")"
chmod 700 "$BACKUP_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "another backup is already running" >&2; exit 1; }

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/hs-arena-backup.XXXXXX")
cleanup() { rm -rf "$work_dir"; }
trap cleanup EXIT
export GNUPGHOME="$work_dir/gnupg"
mkdir -m 700 "$GNUPGHOME"

mkdir -p "$work_dir/payload/server-data" "$work_dir/payload/ecosystem"
cp -a "$SERVER_DATA_DIR"/. "$work_dir/payload/server-data"/
sqlite3 "$ECOSYSTEM_DIR/users.sqlite" ".timeout 30000" ".backup '$work_dir/payload/ecosystem/users.sqlite'"
if [[ -r "$ECOSYSTEM_DIR/kha-vip-profiles.json" ]]; then
  cp -a "$ECOSYSTEM_DIR/kha-vip-profiles.json" "$work_dir/payload/ecosystem/"
fi

(
  cd "$work_dir/payload"
  find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256
)

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_name="hs-arena-${timestamp}.tar.gz.gpg"
temporary_backup="$BACKUP_DIR/.${backup_name}.partial"
final_backup="$BACKUP_DIR/$backup_name"

tar -C "$work_dir/payload" -czf - . \
  | gpg --batch --yes --pinentry-mode loopback \
      --passphrase-file "$PASSPHRASE_FILE" --symmetric --cipher-algo AES256 \
      --s2k-digest-algo SHA512 --s2k-count 65011712 --compress-algo none \
      --output "$temporary_backup"
chmod 600 "$temporary_backup"
mv "$temporary_backup" "$final_backup"
(
  cd "$BACKUP_DIR"
  sha256sum "$backup_name" > "$backup_name.sha256"
)
chmod 600 "$final_backup.sha256"

find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'hs-arena-*.tar.gz.gpg' -o -name 'hs-arena-*.tar.gz.gpg.sha256' \) \
  -mtime "+$RETENTION_DAYS" -delete

echo "$final_backup"
