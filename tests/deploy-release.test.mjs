import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'hs-arena-deploy-test-'));
const appBase = join(root, 'app-base');
const workspace = join(root, 'workspace');
mkdirSync(join(workspace, 'node_modules'), { recursive: true });
mkdirSync(join(workspace, 'server', 'data'), { recursive: true });
writeFileSync(join(workspace, 'server', 'data', 'snapshot.json'), '{}');

function fakeRelease(sha) {
  const directory = join(root, `artifact-${sha}`);
  mkdirSync(join(directory, 'build', 'server'), { recursive: true });
  mkdirSync(join(directory, 'dist'), { recursive: true });
  mkdirSync(join(directory, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(directory, 'build', 'server', 'index.js'), '');
  writeFileSync(join(directory, 'dist', 'index.html'), '');
  writeFileSync(join(directory, 'dist', 'assets', `asset-${sha}.js`), sha);
  writeFileSync(join(directory, 'package.json'), '{}');
  writeFileSync(join(directory, 'package-lock.json'), '{}');
  writeFileSync(join(directory, 'release.json'), JSON.stringify({ sha, packageLockHash: 'a'.repeat(64) }));
  return directory;
}

function deploy(artifact, readiness) {
  return spawnSync('bash', ['scripts/deploy-release.sh', artifact], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      APP_BASE: appBase,
      READY_ATTEMPTS: '1',
      READY_DELAY_SECONDS: '0',
      READINESS_COMMAND: readiness ? 'true' : 'false',
      RESTART_COMMAND: 'true',
      SKIP_DEPENDENCIES: '1',
      SKIP_IMMUTABLE_PERMISSIONS: '1',
      WORKSPACE: workspace,
    },
  });
}

try {
  rmSync(join(workspace, 'node_modules'), { recursive: true });
  const preparationSha = 'd'.repeat(7);
  const preparationFailure = deploy(fakeRelease(preparationSha), true);
  assert.notEqual(preparationFailure.status, 0);
  assert.equal(existsSync(join(appBase, 'releases', preparationSha)), false);
  assert.equal(
    readdirSync(join(appBase, 'releases')).some(name => name.startsWith(`.${preparationSha}.tmp.`)),
    false,
  );
  mkdirSync(join(workspace, 'node_modules'), { recursive: true });

  const firstSha = 'a'.repeat(7);
  const firstArtifact = fakeRelease(firstSha);
  const staleAsset = join(firstArtifact, 'dist', 'assets', 'stale.js');
  writeFileSync(staleAsset, 'stale');
  const staleDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  utimesSync(staleAsset, staleDate, staleDate);
  const first = deploy(firstArtifact, true);
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const firstTarget = resolve(appBase, 'releases', firstSha);
  assert.equal(resolve(appBase, readlinkSync(join(appBase, 'current'))), firstTarget);

  const secondSha = 'b'.repeat(7);
  const second = deploy(fakeRelease(secondSha), true);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  const secondTarget = resolve(appBase, 'releases', secondSha);
  assert.equal(resolve(appBase, readlinkSync(join(appBase, 'current'))), secondTarget);
  assert.equal(resolve(appBase, readlinkSync(join(appBase, 'previous'))), firstTarget);
  assert.equal(readFileSync(join(secondTarget, 'dist', 'assets', `asset-${firstSha}.js`), 'utf8'), firstSha);
  assert.equal(readFileSync(join(secondTarget, 'dist', 'assets', `asset-${secondSha}.js`), 'utf8'), secondSha);
  assert.equal(existsSync(join(secondTarget, 'dist', 'assets', 'stale.js')), false);

  const repeated = deploy(fakeRelease(secondSha), true);
  assert.equal(repeated.status, 0, repeated.stderr || repeated.stdout);
  assert.equal(resolve(appBase, readlinkSync(join(appBase, 'current'))), secondTarget);

  const failedSha = 'c'.repeat(7);
  const failed = deploy(fakeRelease(failedSha), false);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /rolling back/);
  assert.equal(resolve(appBase, readlinkSync(join(appBase, 'current'))), secondTarget);
  assert.equal(resolve(appBase, readlinkSync(join(appBase, 'previous'))), firstTarget);

  console.log('deployment switch and rollback tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
