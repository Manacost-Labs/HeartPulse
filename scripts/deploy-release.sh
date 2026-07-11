#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/release-artifact" >&2
  exit 2
fi

SOURCE_RELEASE=$(realpath "$1")
APP_BASE=${APP_BASE:-/var/www/koloda/data/www/hs-arena.ru}
WORKSPACE=${WORKSPACE:-$APP_BASE/app}
RELEASES_DIR=${RELEASES_DIR:-$APP_BASE/releases}
RUNTIME_DIR=${RUNTIME_DIR:-$APP_BASE/runtime}
SHARED_DATA_DIR=${SHARED_DATA_DIR:-$APP_BASE/shared/server-data}
CURRENT_LINK=${CURRENT_LINK:-$APP_BASE/current}
PREVIOUS_LINK=${PREVIOUS_LINK:-$APP_BASE/previous}
LOCK_FILE=${LOCK_FILE:-$APP_BASE/deploy.lock}
READY_ATTEMPTS=${READY_ATTEMPTS:-20}
READY_DELAY_SECONDS=${READY_DELAY_SECONDS:-1}
RESTART_COMMAND=${RESTART_COMMAND:-sudo systemctl restart hs-arena.service}
READINESS_COMMAND=${READINESS_COMMAND:-curl -fsS --max-time 5 http://127.0.0.1:3101/health/ready >/dev/null}
SKIP_DEPENDENCIES=${SKIP_DEPENDENCIES:-0}
SKIP_IMMUTABLE_PERMISSIONS=${SKIP_IMMUTABLE_PERMISSIONS:-0}
DEPENDENCY_USER=${DEPENDENCY_USER:-koloda}
DATA_USER=${DATA_USER:-koloda}

[[ -f "$SOURCE_RELEASE/release.json" ]] || { echo "release.json is missing" >&2; exit 2; }
RELEASE_SHA=$(node -e "const m=require(process.argv[1]); if(!/^[a-f0-9]{7,40}$/.test(m.sha||'')) process.exit(2); process.stdout.write(m.sha)" "$SOURCE_RELEASE/release.json")
[[ -f "$SOURCE_RELEASE/build/server/index.js" ]] || { echo "compiled server is missing" >&2; exit 2; }
[[ -f "$SOURCE_RELEASE/dist/index.html" ]] || { echo "frontend artifact is missing" >&2; exit 2; }

mkdir -p "$APP_BASE" "$RELEASES_DIR" "$RUNTIME_DIR" "$(dirname "$SHARED_DATA_DIR")"
chmod 755 "$APP_BASE" "$RELEASES_DIR" "$RUNTIME_DIR" "$(dirname "$SHARED_DATA_DIR")"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "another deployment is running" >&2; exit 3; }

STAGING_RELEASE=''
DEPENDENCY_STAGING=''
cleanup_staging() {
  [[ -z "$STAGING_RELEASE" || ! -e "$STAGING_RELEASE" ]] || rm -rf "$STAGING_RELEASE"
  [[ -z "$DEPENDENCY_STAGING" || ! -e "$DEPENDENCY_STAGING" ]] || rm -rf "$DEPENDENCY_STAGING"
}
trap cleanup_staging EXIT

if [[ ! -d "$SHARED_DATA_DIR" ]]; then
  mkdir -p "$SHARED_DATA_DIR"
  if [[ -d "$WORKSPACE/server/data" ]]; then
    cp -a "$WORKSPACE/server/data/." "$SHARED_DATA_DIR/"
  fi
  if [[ $EUID -eq 0 ]] && id "$DATA_USER" >/dev/null 2>&1; then
    chown -R "$DATA_USER:$DATA_USER" "$SHARED_DATA_DIR"
  fi
  chmod -R u+rwX,go+rX "$SHARED_DATA_DIR"
fi

TARGET_RELEASE="$RELEASES_DIR/$RELEASE_SHA"
RELEASE_WORK="$TARGET_RELEASE"
NEW_RELEASE=0
if [[ ! -d "$TARGET_RELEASE" ]]; then
  STAGING_RELEASE="$RELEASES_DIR/.${RELEASE_SHA}.tmp.$$"
  rm -rf "$STAGING_RELEASE"
  cp -a "$SOURCE_RELEASE" "$STAGING_RELEASE"
  RELEASE_WORK="$STAGING_RELEASE"
  NEW_RELEASE=1
fi

if [[ "$NEW_RELEASE" == "1" ]]; then
  if [[ "$SKIP_DEPENDENCIES" == "1" ]]; then
    [[ -d "$WORKSPACE/node_modules" ]] || { echo "workspace node_modules is missing" >&2; exit 2; }
    ln -s "$WORKSPACE/node_modules" "$RELEASE_WORK/node_modules"
  else
    LOCK_HASH=$(node -e "const m=require(process.argv[1]); process.stdout.write(m.packageLockHash.slice(0,24))" "$RELEASE_WORK/release.json")
    DEPENDENCY_ROOT="$RUNTIME_DIR/$LOCK_HASH"
    if [[ ! -d "$DEPENDENCY_ROOT/node_modules" ]]; then
      DEPENDENCY_STAGING="$RUNTIME_DIR/.${LOCK_HASH}.tmp.$$"
      rm -rf "$DEPENDENCY_STAGING"
      mkdir -p "$DEPENDENCY_STAGING"
      chmod 755 "$DEPENDENCY_STAGING"
      cp "$RELEASE_WORK/package.json" "$RELEASE_WORK/package-lock.json" "$DEPENDENCY_STAGING/"
      if [[ $EUID -eq 0 ]] && id "$DEPENDENCY_USER" >/dev/null 2>&1; then
        chown -R "$DEPENDENCY_USER:$DEPENDENCY_USER" "$DEPENDENCY_STAGING"
        (cd "$DEPENDENCY_STAGING" && runuser -u "$DEPENDENCY_USER" -- npm ci --omit=dev --no-audit --no-fund)
        chown -hR root:root "$DEPENDENCY_STAGING"
      else
        (cd "$DEPENDENCY_STAGING" && npm ci --omit=dev --no-audit --no-fund)
      fi
      chmod -R a-w "$DEPENDENCY_STAGING"
      mv "$DEPENDENCY_STAGING" "$DEPENDENCY_ROOT"
      DEPENDENCY_STAGING=''
    fi
    ln -s "$DEPENDENCY_ROOT/node_modules" "$RELEASE_WORK/node_modules"
  fi

  mkdir -p "$RELEASE_WORK/server"
  ln -s "$SHARED_DATA_DIR" "$RELEASE_WORK/server/data"

  if [[ "$SKIP_IMMUTABLE_PERMISSIONS" != "1" ]]; then
    chown -hR root:root "$RELEASE_WORK"
    chmod -R a-w,a+rX "$RELEASE_WORK"
  fi

  mv "$RELEASE_WORK" "$TARGET_RELEASE"
  STAGING_RELEASE=''
else
  [[ -L "$TARGET_RELEASE/node_modules" ]] || { echo "existing release has no immutable dependency link" >&2; exit 2; }
  [[ -L "$TARGET_RELEASE/server/data" ]] || { echo "existing release has no shared data link" >&2; exit 2; }
fi

OLD_RELEASE=''
if [[ -L "$CURRENT_LINK" ]]; then OLD_RELEASE=$(readlink -f "$CURRENT_LINK"); fi
NEXT_LINK="${CURRENT_LINK}.next.$$"
ln -s "$TARGET_RELEASE" "$NEXT_LINK"
mv -Tf "$NEXT_LINK" "$CURRENT_LINK"

restart_service() { bash -c "$RESTART_COMMAND"; }
wait_until_ready() {
  local attempt
  for ((attempt=1; attempt<=READY_ATTEMPTS; attempt+=1)); do
    if bash -c "$READINESS_COMMAND"; then return 0; fi
    sleep "$READY_DELAY_SECONDS"
  done
  return 1
}

if restart_service && wait_until_ready; then
  if [[ -n "$OLD_RELEASE" && "$OLD_RELEASE" != "$TARGET_RELEASE" ]]; then
    PREVIOUS_NEXT="${PREVIOUS_LINK}.next.$$"
    ln -s "$OLD_RELEASE" "$PREVIOUS_NEXT"
    mv -Tf "$PREVIOUS_NEXT" "$PREVIOUS_LINK"
  fi
  echo "deployed $RELEASE_SHA"
  exit 0
fi

echo "release $RELEASE_SHA failed readiness; rolling back" >&2
if [[ -n "$OLD_RELEASE" ]]; then
  ROLLBACK_LINK="${CURRENT_LINK}.rollback.$$"
  ln -s "$OLD_RELEASE" "$ROLLBACK_LINK"
  mv -Tf "$ROLLBACK_LINK" "$CURRENT_LINK"
  restart_service || true
fi
exit 1
