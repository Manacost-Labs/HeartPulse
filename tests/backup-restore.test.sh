#!/usr/bin/env bash
set -Eeuo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/hs-arena-backup-test.XXXXXX")
cleanup() { rm -rf "$fixture"; }
trap cleanup EXIT

mkdir -p "$fixture/server-data/uploads/admin" "$fixture/ecosystem" "$fixture/backups"
printf '{"updatedAt":"2026-07-11T12:00:00.000Z","classes":[]}\n' > "$fixture/server-data/winrates.json"
printf '{"updatedAt":"2026-07-11T12:00:00.000Z","sections":[]}\n' > "$fixture/server-data/tierlist.json"
printf '{"updatedAt":"2026-07-11T12:00:00.000Z","groups":[]}\n' > "$fixture/server-data/legendaries.json"
printf 'upload fixture\n' > "$fixture/server-data/uploads/admin/example.txt"
printf '{"profiles":[]}\n' > "$fixture/ecosystem/kha-vip-profiles.json"
sqlite3 "$fixture/ecosystem/users.sqlite" 'CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ("qa-user");'
openssl rand -out "$fixture/passphrase" -base64 48
chmod 600 "$fixture/passphrase"

export HS_ARENA_BACKUP_DIR="$fixture/backups"
export HS_ARENA_BACKUP_PASSPHRASE_FILE="$fixture/passphrase"
export HS_ARENA_BACKUP_LOCK_FILE="$fixture/backup.lock"
export HS_ARENA_BACKUP_RETENTION_DAYS=1
export SERVER_DATA_DIR="$fixture/server-data"
export ECOSYSTEM_DIR="$fixture/ecosystem"

backup_file=$("$root/scripts/backup-shared-data.sh")
[[ -s "$backup_file" && -s "$backup_file.sha256" ]]
"$root/scripts/verify-backup.sh" "$backup_file" | grep -q 'verified restore'

cp "$backup_file" "$fixture/tampered.enc"
cp "$backup_file.sha256" "$fixture/tampered.enc.sha256"
printf 'tamper' >> "$fixture/tampered.enc"
if "$root/scripts/verify-backup.sh" "$fixture/tampered.enc" >/dev/null 2>&1; then
  echo 'tampered backup unexpectedly passed verification' >&2
  exit 1
fi

echo 'encrypted backup and restore tests passed'
