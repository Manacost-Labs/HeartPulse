import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const sync = readFileSync(join(root, 'deploy/arena-static-sync.sh'), 'utf8');
const activate = readFileSync(join(root, 'deploy/activate-arena-static.sh'), 'utf8');
const service = readFileSync(join(root, 'deploy/systemd/arena-static-sync.service'), 'utf8');
const timer = readFileSync(join(root, 'deploy/systemd/arena-static-sync.timer'), 'utf8');

assert.match(sync, /\^\[a-f0-9\]\{40\}\$/,
  'only immutable full release SHAs may be synchronized');
assert.match(sync, /readlink -f '\$remote_root\/current'/,
  'the current edge release must be checked before starting rsync');
assert.match(sync, /Static assets already current/,
  'an already-current edge must exit its iteration without a full tree scan');
assert.match(sync, /--link-dest="\$remote_root\/current"/,
  'new edge versions must hard-link unchanged files from the active version');
assert.match(sync, /--delay-updates/,
  'changed files must only become visible in the inactive version after transfer');
assert.match(sync, /activate-arena-static activate/,
  'a completed inactive version must use the guarded atomic activator');
assert.doesNotMatch(sync, /StrictHostKeyChecking=(?:no|accept-new)/,
  'edge synchronization must never weaken SSH host verification');

assert.match(activate, /test -s "\$dist\/index\.html"/,
  'activation must require the release entry document');
assert.match(activate, /files < minimum_files \|\| bytes < minimum_bytes/,
  'activation must reject an incomplete static tree');
assert.match(activate, /mv -Tf "\$temporary_link" "\$root\/current"/,
  'the active static version must switch atomically');
assert.match(activate, /previous_active=.*readlink -f "\$root\/current"/,
  'activation must remember the previous release for rollback');
assert.match(activate, /restore_active_release/,
  'activation must restore the previous release when nginx reload fails');
assert.match(activate, /ARENA_STATIC_KEEP_RELEASES:-3/,
  'edge storage must retain a bounded number of immutable frontend releases');
assert.match(activate, /ARENA_STATIC_PREPARE_TTL_MINUTES:-60/,
  'abandoned prepared releases must have a concurrency-safe cleanup grace period');
assert.match(activate, /readlink -f "\$root\/current"/,
  'cleanup must resolve and preserve the active release');
assert.match(activate, /sort -z -nr/,
  'cleanup must retain the newest inactive releases deterministically');
assert.match(activate, /rm -rf -- "\$candidate"/,
  'cleanup must delete only validated inactive release directories');
assert.match(activate, /nginx -t/,
  'the activated release must preserve a valid nginx configuration');

const fixture = mkdtempSync(join(tmpdir(), 'arena-edge-static-retention-'));
try {
  const versions = join(fixture, 'versions');
  mkdirSync(versions, { recursive: true });
  const releases = Array.from({ length: 5 }, (_value, index) => String(index + 1).repeat(40));
  for (const [index, release] of releases.entries()) {
    const dist = join(versions, release, 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'index.html'), `release ${release}\n`);
    writeFileSync(join(versions, release, 'manifest.json'), `{"release":"${release}"}\n`);
    const timestamp = new Date(Date.UTC(2026, 7, 1 + index));
    // Directory mtime is used only to choose which inactive rollback releases survive.
    const result = spawnSync('touch', ['-d', timestamp.toISOString(), join(versions, release)]);
    assert.equal(result.status, 0, result.stderr?.toString());
  }
  const abandonedReleases = ['a'.repeat(40), 'b'.repeat(40)];
  for (const [index, release] of abandonedReleases.entries()) {
    const dist = join(versions, release, 'dist');
    mkdirSync(dist, { recursive: true });
    const entry = join(dist, 'index.html');
    writeFileSync(entry, `incomplete ${release}\n`);
    const timestamp = new Date(Date.UTC(2020, 0, 1 + index));
    utimesSync(entry, timestamp, timestamp);
    utimesSync(dist, timestamp, timestamp);
    utimesSync(join(versions, release), timestamp, timestamp);
  }
  const inProgressRelease = 'c'.repeat(40);
  mkdirSync(join(versions, inProgressRelease, 'dist'), { recursive: true });
  writeFileSync(join(versions, inProgressRelease, 'dist', 'index.html'), 'in progress\n');
  mkdirSync(join(versions, 'operator-notes'));
  symlinkSync(join(versions, releases[0]), join(versions, 'f'.repeat(40)));
  symlinkSync(`versions/${releases[0]}/dist`, join(fixture, 'current'));

  const result = spawnSync('bash', [join(root, 'deploy/activate-arena-static.sh'), 'activate', releases[4]], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ARENA_STATIC_ROOT: fixture,
      ARENA_STATIC_MIN_FILES: '1',
      ARENA_STATIC_MIN_BYTES: '1',
      ARENA_STATIC_KEEP_RELEASES: '3',
      ARENA_STATIC_SKIP_RELOAD: '1',
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(realpathSync(join(fixture, 'current')), join(versions, releases[4], 'dist'));
  assert.ok(existsSync(join(versions, releases[4])), 'active release must survive cleanup');
  assert.ok(existsSync(join(versions, releases[3])), 'newest inactive rollback must survive');
  assert.ok(existsSync(join(versions, releases[2])), 'second inactive rollback must survive');
  assert.equal(existsSync(join(versions, releases[1])), false, 'old inactive release must be pruned');
  assert.equal(existsSync(join(versions, releases[0])), false, 'oldest inactive release must be pruned');
  for (const release of abandonedReleases) {
    assert.equal(existsSync(join(versions, release)), false,
      'an abandoned prepared tree must be removed after the grace period');
  }
  assert.ok(existsSync(join(versions, inProgressRelease)),
    'a recently prepared tree must survive the concurrency grace period');
  assert.ok(existsSync(join(versions, 'operator-notes')), 'unknown directories must never be pruned');
  assert.ok(lstatSync(join(versions, 'f'.repeat(40))).isSymbolicLink(),
    'release-shaped symlinks must never be pruned');
  assert.match(readFileSync(join(fixture, 'current', 'index.html'), 'utf8'), /release 5555/);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

assert.match(service, /ExecStart=\/usr\/local\/sbin\/sync-arena-static/);
assert.match(service, /IOSchedulingClass=best-effort/,
  'background synchronization must not compete with visitor traffic');
assert.match(timer, /OnUnitActiveSec=3m/,
  'regional convergence must remain bounded to a few minutes');
assert.match(timer, /RandomizedDelaySec=30s/,
  'regional synchronization must avoid a fixed thundering-herd schedule');

console.log('edge static delta synchronization contracts passed');
