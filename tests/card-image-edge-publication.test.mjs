import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = resolve(new URL('..', import.meta.url).pathname);
const activationScript = join(repository, 'deploy/activate-arena-card-images.sh');
const syncScript = join(repository, 'deploy/arena-card-image-sync.sh');
const root = mkdtempSync(join(tmpdir(), 'arena-card-edge-publication-'));
const version = 'card_img_v99_test';
const environment = {
  ...process.env,
  ARENA_CARD_IMAGE_ROOT: root,
  ARENA_CARD_IMAGE_MIN_FILES: '1',
  ARENA_CARD_IMAGE_MIN_BYTES: '1',
  ARENA_CARD_IMAGE_SKIP_RELOAD: '1',
  ARENA_CARD_IMAGE_OWNER: '',
  ARENA_CARD_IMAGE_GROUP: '',
};

function run(mode, expectedStatus = 0) {
  const result = spawnSync('bash', [activationScript, mode, version], {
    env: environment,
    encoding: 'utf8',
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
}

try {
  run('prepare');
  const raw = join(root, 'versions', version, 'raw');
  writeFileSync(join(raw, `CARD_A-thumb-blizzard-${version}.webp`), 'thumb-a');
  writeFileSync(join(raw, `CARD_A-full-blizzard-${version}.webp`), 'full-a');
  run('activate');
  run('current');

  let current = resolve(root, 'current');
  assert.ok(existsSync(join(current, 'CARD_A-thumb-blizzard.webp')));
  assert.equal(readFileSync(join(current, 'CARD_A-full-blizzard.webp'), 'utf8'), 'full-a');

  writeFileSync(join(raw, `CARD_B-thumb-blizzard-${version}.webp`), 'thumb-b');
  run('current', 1);
  run('activate');
  run('current');
  current = resolve(root, 'current');
  assert.ok(existsSync(join(current, 'CARD_B-thumb-blizzard.webp')),
    'newly synchronized cards must enter the active local mirror');

  rmSync(join(raw, `CARD_A-full-blizzard-${version}.webp`));
  run('current', 1);
  run('activate');
  run('current');
  current = resolve(root, 'current');
  assert.equal(existsSync(join(current, 'CARD_A-full-blizzard.webp')), false,
    'removed raw images must not survive in a newly published generation');

  const syncSource = readFileSync(syncScript, 'utf8');
  assert.match(syncSource, /activate-arena-card-images current '\$version'/,
    'the origin sync must verify publication freshness instead of checking only the version symlink');
  assert.doesNotMatch(syncSource, /\/versions\/\$version\/serve['"]?/,
    'the sync skip path must not assume that an old fixed serve directory is complete');
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('card-image edge publication contracts passed');
