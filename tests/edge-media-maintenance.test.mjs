import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const syncScript = join(root, 'deploy/arena-card-image-sync.sh');
const warmScript = join(root, 'deploy/warm-arena-public-resources.sh');
const warm = readFileSync(warmScript, 'utf8');
const sync = readFileSync(syncScript, 'utf8');

assert.doesNotMatch(warm, /arena\.hs-manacost\.ru/,
  'the warm must target the active public hosts, not the retired redirect host');
assert.match(warm, /--resolve "\$\{site_host\}:443:\$\{edge_ip\}"/,
  'every warm request must be pinned to the edge being warmed');
assert.doesNotMatch(warm, /--location/,
  'a redirect must be reported as a failure instead of being followed to another edge');
assert.match(warm, /_client-reference-manifest\.js/,
  'the warm must cover the hashed Next.js assets of the current build');
assert.match(warm, /api\/card-image\/\\\\1\/\\\\2\.webp\?v=\$\{card_version\}/,
  'card images must be warmed through the CDN with the canonical cache version');
assert.match(warm, /deadline_seconds="\$\{ARENA_WARM_DEADLINE_SECONDS:-2400\}"/,
  'the warm must finish with a report before the 45-minute unit timeout');
assert.doesNotMatch(sync, /162\.19\.220\.14/,
  'card image topology must come from the root-managed edge configuration');
assert.match(sync, /ARENA_STATIC_EDGE_SPECS/,
  'card images must follow the same edge topology as the frontend sync');

for (const unit of ['arena-public-resource-warm', 'arena-public-resource-warm-ru', 'arena-public-resource-warm-ru-novosibirsk', 'arena-public-resource-warm-eu-london']) {
  const service = readFileSync(join(root, `deploy/systemd/${unit}.service`), 'utf8');
  assert.match(service, /TimeoutStartSec=45min/, `${unit} must keep a bounded run time`);
  assert.match(service, /ExecStart=\/usr\/local\/sbin\/warm-arena-public-resources \d+\.\d+\.\d+\.\d+$/m,
    `${unit} must name the edge it warms`);
}
assert.match(readFileSync(join(root, 'deploy/systemd/arena-card-image-sync.service'), 'utf8'), /TimeoutStartSec=/,
  'the card image sync must not hang on an unreachable edge');

const fixture = mkdtempSync(join(tmpdir(), 'arena-edge-media-maintenance-'));
try {
  // A quarantined edge is skipped before any network access.
  const quarantine = join(fixture, 'monitor.env');
  writeFileSync(quarantine, 'HEARTHPULSE_MONITOR_QUARANTINED_REGIONS=limburg,novosibirsk\n');
  const skipped = spawnSync('bash', [warmScript, '162.19.220.14'], {
    encoding: 'utf8',
    env: { ...process.env, ARENA_WARM_QUARANTINE_FILE: quarantine, ARENA_WARM_STATE_ROOT: join(fixture, 'state') },
  });
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.match(skipped.stdout, /edge=eu-limburg is quarantined/);
  const unsupported = spawnSync('bash', [warmScript, '203.0.113.9'], { encoding: 'utf8' });
  assert.equal(unsupported.status, 2, 'an unknown edge must be rejected');

  // The card sync contacts only the configured edges.
  const bin = join(fixture, 'bin');
  const release = join(fixture, 'release');
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(release, 'build/server'), { recursive: true });
  writeFileSync(join(release, 'build/server/cardImageCache.js'), "export const CARD_IMAGE_CACHE_VERSION = 'card_img_v9_test';\n");
  const calls = join(fixture, 'calls.log');
  for (const tool of ['ssh', 'rsync']) {
    writeFileSync(join(bin, tool), `#!/usr/bin/env bash\nprintf '${tool} %s\\n' "$*" >> '${calls}'\n`);
    chmodSync(join(bin, tool), 0o755);
  }
  const config = join(fixture, 'edge-static-sync.conf');
  writeFileSync(config, 'ARENA_STATIC_EDGE_SPECS=(\n  "root@edge-a.test|/dev/null"\n)\n');
  const synced = spawnSync('bash', [syncScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      ARENA_CARD_IMAGE_SYNC_CONFIG: config,
      ARENA_CARD_IMAGE_RELEASE_ROOT: release,
      ARENA_CARD_IMAGE_SOURCE_ROOT: fixture,
    },
  });
  assert.equal(synced.status, 0, synced.stderr);
  assert.match(synced.stdout, /Card images already current on root@edge-a\.test/);
  const log = readFileSync(calls, 'utf8');
  assert.match(log, /root@edge-a\.test sudo \/usr\/local\/sbin\/activate-arena-card-images prepare 'card_img_v9_test'/);
  assert.doesNotMatch(log, /162\.19\.220\.14/, 'a removed edge must not be contacted');

  // A failing best-effort edge is logged and recorded but never fails the run.
  const failingBin = join(fixture, 'failing-bin');
  mkdirSync(failingBin, { recursive: true });
  writeFileSync(join(failingBin, 'ssh'),
    `#!/usr/bin/env bash\nprintf 'ssh %s\\n' "$*" >> '${calls}'\n[[ "$*" == *edge-eu.test* ]] && exit 255\nexit 0\n`);
  chmodSync(join(failingBin, 'ssh'), 0o755);
  const optional = join(fixture, 'optional.conf');
  writeFileSync(optional, 'ARENA_CARD_IMAGE_OPTIONAL_EDGE_SPECS=(\n  "debian@edge-eu.test|/dev/null"\n)\n');
  const statusDir = join(fixture, 'status');
  const bestEffort = spawnSync('bash', [syncScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${failingBin}:${bin}:${process.env.PATH}`,
      ARENA_CARD_IMAGE_SYNC_CONFIG: config,
      ARENA_CARD_IMAGE_OPTIONAL_CONFIG: optional,
      ARENA_CARD_IMAGE_STATUS_DIR: statusDir,
      ARENA_CARD_IMAGE_RELEASE_ROOT: release,
      ARENA_CARD_IMAGE_SOURCE_ROOT: fixture,
    },
  });
  assert.equal(bestEffort.status, 0, 'a best-effort edge must not fail the sync');
  assert.match(bestEffort.stderr, /Best-effort card image edge failed and is not counted: debian@edge-eu\.test/);
  assert.match(readFileSync(join(statusDir, 'debian@edge-eu.test.status'), 'utf8'), /^failed card_img_v9_test /);
  assert.match(readFileSync(join(statusDir, 'root@edge-a.test.status'), 'utf8'), /^ok card_img_v9_test /);

  writeFileSync(config, 'ARENA_STATIC_EDGE_SPECS=()\n');
  const empty = spawnSync('bash', [syncScript], {
    encoding: 'utf8',
    env: { ...process.env, ARENA_CARD_IMAGE_SYNC_CONFIG: config, ARENA_CARD_IMAGE_RELEASE_ROOT: release },
  });
  assert.equal(empty.status, 2, 'an empty topology must fail instead of reporting success');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

console.log('edge media maintenance contracts passed');
