#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

# HEARTHPULSE_BACKUP_* variables replace the legacy HS_ARENA_BACKUP_* names,
# which are still honoured so existing unit environments keep working.
BACKUP_DIR=${HEARTHPULSE_BACKUP_DIR:-${HS_ARENA_BACKUP_DIR:-/var/backups/hearthpulse}}
PASSPHRASE_FILE=${HEARTHPULSE_BACKUP_PASSPHRASE_FILE:-${HS_ARENA_BACKUP_PASSPHRASE_FILE:-/etc/hearthpulse/backup-passphrase}}
SERVER_DATA_DIR=${SERVER_DATA_DIR:-/var/www/koloda/data/www/hs-arena.ru/shared/server-data}
ECOSYSTEM_DIR=${ECOSYSTEM_DIR:-/var/lib/manacost-ecosystem}
KEEP_COUNT=${HEARTHPULSE_BACKUP_KEEP:-3}
LOCK_FILE=${HEARTHPULSE_BACKUP_LOCK_FILE:-${HS_ARENA_BACKUP_LOCK_FILE:-/run/lock/hearthpulse-backup.lock}}

for command in flock sqlite3 tar gpg sha256sum find; do
  command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 1; }
done

[[ -d "$SERVER_DATA_DIR" ]] || { echo "server data directory is missing" >&2; exit 1; }
[[ -r "$ECOSYSTEM_DIR/users.sqlite" ]] || { echo "ecosystem database is missing" >&2; exit 1; }
[[ -r "$PASSPHRASE_FILE" ]] || { echo "backup passphrase file is missing" >&2; exit 1; }
[[ "$KEEP_COUNT" =~ ^[1-9][0-9]*$ ]] || { echo "backup keep count must be a positive integer" >&2; exit 1; }

mkdir -p "$BACKUP_DIR" "$(dirname "$LOCK_FILE")"
chmod 700 "$BACKUP_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "another backup is already running" >&2; exit 1; }

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/hearthpulse-backup.XXXXXX")
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
backup_name="hearthpulse-${timestamp}.tar.gz.gpg"
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

# Keep the newest KEEP_COUNT backups (current and legacy hs-arena names) with
# their checksums; the off-site copy keeps the same count independently.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'hearthpulse-*.tar.gz.gpg' -o -name 'hs-arena-*.tar.gz.gpg' \) \
  -printf '%T@ %p\n' | sort -nr | tail -n +"$((KEEP_COUNT + 1))" | cut -d' ' -f2- \
  | while IFS= read -r expired; do rm -f -- "$expired" "$expired.sha256"; done

echo "$final_backup"
