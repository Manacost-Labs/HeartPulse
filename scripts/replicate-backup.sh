#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

BACKUP_DIR=${HS_ARENA_BACKUP_DIR:-/var/backups/hs-arena}
REMOTE_HOST=${HS_ARENA_BACKUP_REMOTE_HOST:-}
REMOTE_USER=${HS_ARENA_BACKUP_REMOTE_USER:-}
REMOTE_DIR=${HS_ARENA_BACKUP_REMOTE_DIR:-}
REMOTE_PORT=${HS_ARENA_BACKUP_REMOTE_PORT:-22}
SSH_KEY=${HS_ARENA_BACKUP_SSH_KEY:-/etc/hs-arena/backup-replication-key}
KNOWN_HOSTS=${HS_ARENA_BACKUP_KNOWN_HOSTS:-/etc/hs-arena/backup-known-hosts}
SSH_BIN=${HS_ARENA_SSH_BIN:-ssh}
RSYNC_BIN=${HS_ARENA_RSYNC_BIN:-rsync}
backup_file=${1:-}

for command in find sha256sum "$SSH_BIN" "$RSYNC_BIN"; do
  command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 1; }
done

[[ "$REMOTE_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || { echo "invalid or missing remote host" >&2; exit 1; }
[[ "$REMOTE_USER" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]] || { echo "invalid or missing remote user" >&2; exit 1; }
[[ "$REMOTE_DIR" =~ ^/[A-Za-z0-9_./-]+$ && "/$REMOTE_DIR/" != *"/../"* ]] \
  || { echo "remote directory must be an absolute safe path" >&2; exit 1; }
[[ "$REMOTE_PORT" =~ ^[0-9]+$ && "$REMOTE_PORT" -ge 1 && "$REMOTE_PORT" -le 65535 ]] \
  || { echo "remote port must be between 1 and 65535" >&2; exit 1; }
[[ -r "$SSH_KEY" ]] || { echo "backup SSH key is missing" >&2; exit 1; }
[[ -r "$KNOWN_HOSTS" ]] || { echo "pinned backup known_hosts file is missing" >&2; exit 1; }

if [[ -z "$backup_file" ]]; then
  backup_file=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'hs-arena-*.tar.gz.gpg' -printf '%T@ %p\n' \
    | sort -nr | head -1 | cut -d' ' -f2-)
fi

[[ -n "$backup_file" && -r "$backup_file" ]] || { echo "encrypted backup is missing" >&2; exit 1; }
[[ -r "$backup_file.sha256" ]] || { echo "backup checksum is missing" >&2; exit 1; }
backup_name=$(basename "$backup_file")
[[ "$backup_name" =~ ^hs-arena-[0-9]{8}T[0-9]{6}Z\.tar\.gz\.gpg$ ]] \
  || { echo "unexpected backup filename" >&2; exit 1; }

(
  cd "$(dirname "$backup_file")"
  sha256sum -c "$backup_name.sha256"
)

ssh_options=(
  -p "$REMOTE_PORT"
  -i "$SSH_KEY"
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$KNOWN_HOSTS"
  -o ConnectTimeout=15
)
printf -v rsync_shell '%q ' "$SSH_BIN" "${ssh_options[@]}"
remote="$REMOTE_USER@$REMOTE_HOST"

"$RSYNC_BIN" \
  --archive --checksum --partial --protect-args --chmod=F600 \
  -e "$rsync_shell" -- \
  "$backup_file" "$backup_file.sha256" "$remote:$REMOTE_DIR/"

printf -v remote_verify 'cd %q && sha256sum -c %q' "$REMOTE_DIR" "$backup_name.sha256"
"$SSH_BIN" "${ssh_options[@]}" "$remote" "$remote_verify"

echo "replicated and verified: $backup_name"
