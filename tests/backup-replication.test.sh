#!/usr/bin/env bash
set -Eeuo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/hs-arena-replication-test.XXXXXX")
cleanup() { rm -rf "$fixture"; }
trap cleanup EXIT

mkdir -p "$fixture/bin" "$fixture/backups" "$fixture/remote"
touch "$fixture/key" "$fixture/known-hosts"
backup="$fixture/backups/hs-arena-20260712T040000Z.tar.gz.gpg"
printf 'encrypted-fixture\n' > "$backup"
(
  cd "$fixture/backups"
  sha256sum "$(basename "$backup")" > "$(basename "$backup").sha256"
)

cat > "$fixture/bin/fake-rsync" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$FAKE_COMMAND_LOG"
args=("$@")
count=${#args[@]}
cp "${args[count-3]}" "${args[count-2]}" "$FAKE_REMOTE_DIR/"
SCRIPT

cat > "$fixture/bin/fake-ssh" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$FAKE_COMMAND_LOG"
command=${!#}
bash -c "$command"
SCRIPT
chmod 700 "$fixture/bin/fake-rsync" "$fixture/bin/fake-ssh"

export HS_ARENA_BACKUP_DIR="$fixture/backups"
export HS_ARENA_BACKUP_REMOTE_HOST=backup.example.test
export HS_ARENA_BACKUP_REMOTE_USER=arena_backup
export HS_ARENA_BACKUP_REMOTE_DIR="$fixture/remote"
export HS_ARENA_BACKUP_SSH_KEY="$fixture/key"
export HS_ARENA_BACKUP_KNOWN_HOSTS="$fixture/known-hosts"
export HS_ARENA_RSYNC_BIN="$fixture/bin/fake-rsync"
export HS_ARENA_SSH_BIN="$fixture/bin/fake-ssh"
export FAKE_REMOTE_DIR="$fixture/remote"
export FAKE_COMMAND_LOG="$fixture/commands.log"

"$root/scripts/replicate-backup.sh" "$backup" | grep -q 'replicated and verified'
cmp "$backup" "$fixture/remote/$(basename "$backup")"
grep -q -- '--checksum' "$fixture/commands.log"
grep -q -- 'StrictHostKeyChecking=yes' "$fixture/commands.log"

printf 'tampered\n' >> "$backup"
if "$root/scripts/replicate-backup.sh" "$backup" >/dev/null 2>&1; then
  echo 'tampered backup unexpectedly replicated' >&2
  exit 1
fi

export HS_ARENA_BACKUP_REMOTE_DIR='../unsafe'
if "$root/scripts/replicate-backup.sh" "$backup" >/dev/null 2>&1; then
  echo 'unsafe remote path unexpectedly accepted' >&2
  exit 1
fi

echo 'off-site backup replication tests passed'
