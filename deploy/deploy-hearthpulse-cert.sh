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
	remote_dir=$(ssh "${options[@]}" "$target" 'mktemp -d /tmp/hearthpulse-cert.XXXXXX')
	trap 'ssh "${options[@]}" "$target" "rm -rf -- \"$remote_dir\"" >/dev/null 2>&1 || true' RETURN
	scp "${options[@]}" "$lineage/fullchain.pem" "$lineage/privkey.pem" "$target:$remote_dir/"
	ssh "${options[@]}" "$target" bash -s -- "$privilege" "$remote_dir" "$destination" <<'REMOTE'
set -euo pipefail
privilege=$1
remote_dir=$2
destination=$3
run() {
	if [[ -n "$privilege" ]]; then
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

deploy_edge debian@162.19.220.14 /home/debian/.ssh/koloda_proxy_ed25519 sudo
deploy_edge root@194.67.92.242 /home/debian/.ssh/koloda_proxy_ed25519 ''
deploy_edge root@186.246.28.244 /root/.ssh/koloda_proxy_ru-novosibirsk_ed25519 ''
