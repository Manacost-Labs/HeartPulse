#!/usr/bin/env bash
set -Eeuo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/hearthpulse-backup-test.XXXXXX")
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

export HEARTHPULSE_BACKUP_DIR="$fixture/backups"
export HEARTHPULSE_BACKUP_PASSPHRASE_FILE="$fixture/passphrase"
export HEARTHPULSE_BACKUP_LOCK_FILE="$fixture/backup.lock"
export HEARTHPULSE_BACKUP_KEEP=3
export SERVER_DATA_DIR="$fixture/server-data"
export ECOSYSTEM_DIR="$fixture/ecosystem"

backup_file=$("$root/scripts/backup-shared-data.sh")
[[ -s "$backup_file" && -s "$backup_file.sha256" ]]
[[ "$(basename "$backup_file")" =~ ^hearthpulse-[0-9]{8}T[0-9]{6}Z\.tar\.gz\.gpg$ ]]
"$root/scripts/verify-backup.sh" "$backup_file" | grep -q 'verified restore'

restored_root="$fixture/restored"
"$root/scripts/restore-backup.sh" "$backup_file" "$restored_root" | grep -q "$restored_root"
[[ -s "$restored_root/server-data/uploads/admin/example.txt" ]]
[[ "$(sqlite3 "$restored_root/ecosystem/users.sqlite" 'SELECT id FROM users;')" == 'qa-user' ]]
if "$root/scripts/restore-backup.sh" "$backup_file" "$restored_root" >/dev/null 2>&1; then
  echo 'restore unexpectedly overwrote a populated target' >&2
  exit 1
fi

cp "$backup_file" "$fixture/tampered.enc"
cp "$backup_file.sha256" "$fixture/tampered.enc.sha256"
printf 'tamper' >> "$fixture/tampered.enc"
if "$root/scripts/verify-backup.sh" "$fixture/tampered.enc" >/dev/null 2>&1; then
  echo 'tampered backup unexpectedly passed verification' >&2
  exit 1
fi

# Retention keeps the newest HEARTHPULSE_BACKUP_KEEP backups across current and
# legacy names and removes the checksum sidecars of expired archives.
for old in hearthpulse-20260101T000000Z hs-arena-20260102T000000Z hearthpulse-20260103T000000Z; do
  printf 'old' > "$fixture/backups/$old.tar.gz.gpg"
  printf 'old' > "$fixture/backups/$old.tar.gz.gpg.sha256"
done
touch -d '2026-01-01' "$fixture/backups/hearthpulse-20260101T000000Z.tar.gz.gpg"
touch -d '2026-01-02' "$fixture/backups/hs-arena-20260102T000000Z.tar.gz.gpg"
touch -d '2026-01-03' "$fixture/backups/hearthpulse-20260103T000000Z.tar.gz.gpg"
touch -d '2026-01-04' "$backup_file"
printf 'keep' > "$fixture/backups/rollback-note.json"
sleep 1
newest=$("$root/scripts/backup-shared-data.sh")
mapfile -t kept < <(cd "$fixture/backups" && ls -1 -- *.tar.gz.gpg | sort)
expected=("$(basename "$backup_file")" "$(basename "$newest")" hearthpulse-20260103T000000Z.tar.gz.gpg)
mapfile -t expected < <(printf '%s\n' "${expected[@]}" | sort)
[[ "${kept[*]}" == "${expected[*]}" ]] || { echo "unexpected retained backups: ${kept[*]}" >&2; exit 1; }
[[ ! -e "$fixture/backups/hs-arena-20260102T000000Z.tar.gz.gpg.sha256" ]]
[[ ! -e "$fixture/backups/hearthpulse-20260101T000000Z.tar.gz.gpg.sha256" ]]
[[ -e "$fixture/backups/rollback-note.json" ]]

# Legacy HS_ARENA_BACKUP_* variables still configure the scripts.
legacy_dir="$fixture/legacy-backups"
legacy=$(env -u HEARTHPULSE_BACKUP_DIR -u HEARTHPULSE_BACKUP_PASSPHRASE_FILE -u HEARTHPULSE_BACKUP_LOCK_FILE \
  HS_ARENA_BACKUP_DIR="$legacy_dir" HS_ARENA_BACKUP_PASSPHRASE_FILE="$fixture/passphrase" \
  HS_ARENA_BACKUP_LOCK_FILE="$fixture/legacy.lock" "$root/scripts/backup-shared-data.sh")
[[ "$(dirname "$legacy")" == "$legacy_dir" ]]
env -u HEARTHPULSE_BACKUP_DIR -u HEARTHPULSE_BACKUP_PASSPHRASE_FILE \
  HS_ARENA_BACKUP_DIR="$legacy_dir" HS_ARENA_BACKUP_PASSPHRASE_FILE="$fixture/passphrase" \
  "$root/scripts/verify-backup.sh" | grep -q 'verified restore'

if HEARTHPULSE_BACKUP_KEEP=0 "$root/scripts/backup-shared-data.sh" >/dev/null 2>&1; then
  echo 'zero keep count was unexpectedly accepted' >&2
  exit 1
fi

echo 'encrypted backup and restore tests passed'
