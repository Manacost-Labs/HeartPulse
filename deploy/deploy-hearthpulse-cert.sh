#!/usr/bin/env bash
set -euo pipefail

expected_lineage=/etc/letsencrypt/live/hearthpulse.net
lineage=${RENEWED_LINEAGE:-$expected_lineage}
if [[ "$lineage" != "$expected_lineage" ]]; then
	exit 0
fi

known_hosts=/home/debian/.ssh/known_hosts
destination=/etc/nginx/ssl/hearthpulse.net

deploy_edge() {
	local target=$1
	local identity=$2
	local privilege=$3
	local remote_dir
	local options=(-i "$identity" -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$known_hosts" -o ConnectTimeout=10)
	# Called from an `if`, where errexit is off: every step must fail explicitly.
	remote_dir=$(ssh "${options[@]}" "$target" 'mktemp -d /tmp/hearthpulse-cert.XXXXXX') || return 1
	[[ "$remote_dir" == /tmp/hearthpulse-cert.* ]] || return 1
	trap 'ssh "${options[@]}" "$target" "rm -rf -- \"$remote_dir\"" >/dev/null 2>&1 || true' RETURN
	scp "${options[@]}" "$lineage/fullchain.pem" "$lineage/privkey.pem" "$target:$remote_dir/" || return 1
	ssh "${options[@]}" "$target" bash -s -- "$privilege" "$remote_dir" "$destination" <<'REMOTE' || return 1
set -euo pipefail
privilege=$1
remote_dir=$2
destination=$3
run() {
	if [[ "$privilege" != none ]]; then
		"$privilege" "$@"
	else
		"$@"
	fi
}
run install -d -o root -g root -m 0755 "$destination"
run install -o root -g root -m 0644 "$remote_dir/fullchain.pem" "$destination/fullchain.pem"
run install -o root -g root -m 0600 "$remote_dir/privkey.pem" "$destination/privkey.pem"
run nginx -t
run systemctl reload nginx
rm -rf -- "$remote_dir"
REMOTE
	trap - RETURN
}

# One unreachable edge must not leave the others on the expiring certificate:
# each edge is attempted, and the hook fails afterwards if any of them failed.
failed_edges=()
for edge in \
	'root@194.67.92.242 /home/debian/.ssh/koloda_proxy_ed25519 none' \
	'root@186.246.28.244 /root/.ssh/koloda_proxy_ru-novosibirsk_ed25519 none' \
	'debian@57.129.183.118 /home/debian/.ssh/koloda_proxy_ed25519 sudo'; do
	read -r target identity privilege <<<"$edge"
	if ! (deploy_edge "$target" "$identity" "$privilege"); then
		printf 'hearthpulse certificate deploy failed: %s\n' "$target" >&2
		failed_edges+=("$target")
	fi
done
((${#failed_edges[@]} == 0))
