#!/usr/bin/env bash
set -euo pipefail

CAPABILITY=scraper-runtime-probe-v1
GATE_CAPABILITY=require-deployer-capability-v1
SOURCE_ROOT=$(realpath "$(dirname "$0")/..")
SOURCE_DEPLOYER=$SOURCE_ROOT/scripts/deploy-release.sh
SOURCE_GATE=$SOURCE_ROOT/deploy/hs-arena-ci-deploy
INSTALL_DEPLOYER=/usr/local/libexec/hs-arena/deploy-release.sh
INSTALL_CAPABILITIES=/usr/local/libexec/hs-arena/deploy-release.capabilities
INSTALL_GATE=/usr/local/sbin/hs-arena-ci-deploy

usage() {
  echo "Usage: $0 --install|--check" >&2
  exit 2
}

assert_protected_file() {
  local file=$1 expected_mode=$2 owner mode
  [[ -f "$file" && ! -L "$file" ]] || { echo "installed file is missing or unsafe: $file" >&2; exit 2; }
  owner=$(stat -c '%U:%G' "$file")
  mode=$(stat -c '%a' "$file")
  [[ "$owner" == 'root:root' && "$mode" == "$expected_mode" ]] || {
    echo "installed file ownership or mode is unsafe: $file ($owner $mode)" >&2
    exit 2
  }
}

check_installation() {
  assert_protected_file "$INSTALL_DEPLOYER" 755
  assert_protected_file "$INSTALL_CAPABILITIES" 644
  assert_protected_file "$INSTALL_GATE" 755

  [[ "$(sha256sum "$SOURCE_DEPLOYER" | cut -d' ' -f1)" == "$(sha256sum "$INSTALL_DEPLOYER" | cut -d' ' -f1)" ]] || {
    echo "installed deployer checksum does not match the reviewed source" >&2
    exit 2
  }
  [[ "$(sha256sum "$SOURCE_GATE" | cut -d' ' -f1)" == "$(sha256sum "$INSTALL_GATE" | cut -d' ' -f1)" ]] || {
    echo "installed gate checksum does not match the reviewed source" >&2
    exit 2
  }
  grep -Fxq "$CAPABILITY" "$INSTALL_CAPABILITIES" || { echo "installed capability manifest is incomplete" >&2; exit 2; }
  "$INSTALL_DEPLOYER" --capabilities | grep -Fxq "$CAPABILITY"
  "$INSTALL_GATE" --capabilities | grep -Fxq "$GATE_CAPABILITY"
  "$INSTALL_DEPLOYER" --version
  "$INSTALL_GATE" --version
}

[[ $# -eq 1 ]] || usage
case "$1" in
  --check)
    check_installation
    ;;
  --install)
    [[ $EUID -eq 0 ]] || { echo "--install must run as root" >&2; exit 2; }
    [[ -f "$SOURCE_DEPLOYER" && -f "$SOURCE_GATE" ]] || { echo "reviewed deployer sources are missing" >&2; exit 2; }
    install -d -o root -g root -m 0755 /usr/local/libexec/hs-arena /usr/local/sbin

    deployer_stage=$(mktemp /usr/local/libexec/hs-arena/.deploy-release.XXXXXX)
    capabilities_stage=$(mktemp /usr/local/libexec/hs-arena/.deploy-release-capabilities.XXXXXX)
    gate_stage=$(mktemp /usr/local/sbin/.hs-arena-ci-deploy.XXXXXX)
    cleanup() { rm -f "$deployer_stage" "$capabilities_stage" "$gate_stage"; }
    trap cleanup EXIT

    install -o root -g root -m 0755 "$SOURCE_DEPLOYER" "$deployer_stage"
    install -o root -g root -m 0755 "$SOURCE_GATE" "$gate_stage"
    printf '%s\n' "$CAPABILITY" > "$capabilities_stage"
    chown root:root "$capabilities_stage"
    chmod 0644 "$capabilities_stage"

    [[ "$(sha256sum "$SOURCE_DEPLOYER" | cut -d' ' -f1)" == "$(sha256sum "$deployer_stage" | cut -d' ' -f1)" ]]
    [[ "$(sha256sum "$SOURCE_GATE" | cut -d' ' -f1)" == "$(sha256sum "$gate_stage" | cut -d' ' -f1)" ]]
    "$deployer_stage" --capabilities | grep -Fxq "$CAPABILITY"
    DEPLOYER="$deployer_stage" DEPLOYER_CAPABILITIES_FILE="$capabilities_stage" \
      "$gate_stage" --capabilities | grep -Fxq "$GATE_CAPABILITY"

    mv -f "$deployer_stage" "$INSTALL_DEPLOYER"
    mv -f "$capabilities_stage" "$INSTALL_CAPABILITIES"
    mv -f "$gate_stage" "$INSTALL_GATE"
    trap - EXIT
    check_installation
    ;;
  *) usage ;;
esac
