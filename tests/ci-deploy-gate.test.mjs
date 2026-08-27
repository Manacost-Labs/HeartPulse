import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const gate = path.resolve('deploy/hs-arena-ci-deploy');
const sha = 'a'.repeat(40);

function hash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'hs-arena-ci-gate-'));
  const runnerTemp = path.join(root, 'runner-temp');
  const artifact = path.join(runnerTemp, 'release');
  const deployer = path.join(root, 'deployer');
  const deployerCapabilities = path.join(root, 'deployer.capabilities');
  const marker = path.join(root, 'deployed');
  const staticSync = path.join(root, 'static-sync');
  const staticSyncMarker = path.join(root, 'static-synced');
  mkdirSync(artifact, { recursive: true });
  writeFileSync(path.join(artifact, 'critical.txt'), 'validated payload\n');
  writeFileSync(path.join(artifact, 'release.json'), JSON.stringify({
    schemaVersion: 2,
    sha,
    checksums: {
      'critical.txt': hash(path.join(artifact, 'critical.txt')),
    },
  }));
  writeFileSync(deployer, [
    '#!/usr/bin/env bash',
    'if [[ ${1:-} == --capabilities ]]; then',
    "  printf 'scraper-runtime-probe-v1\\n'",
    '  exit 0',
    'fi',
    `printf '%s' \"$1\" > ${JSON.stringify(marker)}`,
    '',
  ].join('\n'));
  chmodSync(deployer, 0o755);
  writeFileSync(deployerCapabilities, 'scraper-runtime-probe-v1\n');
  chmodSync(deployerCapabilities, 0o644);
  writeFileSync(staticSync, `#!/usr/bin/env bash\nprintf 'synced' > ${JSON.stringify(staticSyncMarker)}\n`);
  chmodSync(staticSync, 0o755);
  return {
    root,
    runnerTemp,
    artifact,
    deployer,
    deployerCapabilities,
    marker,
    staticSync,
    staticSyncMarker,
  };
}

function run(input, expectedSha = sha) {
  return spawnSync('bash', [
    gate,
    '--require-capability=scraper-runtime-probe-v1',
    input.artifact,
    expectedSha,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      RUNNER_TEMP_ROOT: input.runnerTemp,
      DEPLOYER: input.deployer,
      DEPLOYER_CAPABILITIES_FILE: input.deployerCapabilities,
      STATIC_SYNC_COMMAND: input.staticSyncCommand || input.staticSync,
    },
  });
}

test('publishes an auditable gate version and capability contract', () => {
  const version = spawnSync('bash', [gate, '--version'], { encoding: 'utf8' });
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /^hs-arena-ci-deploy \d+\.\d+\.\d+\n$/);

  const capabilities = spawnSync('bash', [gate, '--capabilities'], { encoding: 'utf8' });
  assert.equal(capabilities.status, 0, capabilities.stderr);
  assert.match(capabilities.stdout, /^require-deployer-capability-v1$/m);
});

test('deploys only a read-only artifact with the exact validated SHA and checksums', () => {
  const input = fixture();
  try {
    const result = run(input);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(input.marker, 'utf8'), path.resolve(input.artifact));
    assert.equal(readFileSync(input.staticSyncMarker, 'utf8'), 'synced');
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});

test('reports a failed immediate edge synchronization after a successful deploy', () => {
  const input = fixture();
  try {
    input.staticSyncCommand = 'false';
    const result = run(input);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(input.marker, 'utf8'), path.resolve(input.artifact));
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});

test('blocks a legacy deployer without the required browser probe before any mutation', () => {
  const input = fixture();
  try {
    rmSync(input.deployerCapabilities);

    const result = run(input);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /required deployer capability is missing: scraper-runtime-probe-v1/i);
    assert.equal(existsSync(input.marker), false, 'legacy deployer must be rejected before it receives the artifact');
    assert.equal(existsSync(input.staticSyncMarker), false, 'static sync must not run after capability rejection');
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});

test('rejects SHA mismatch, writable payloads, symlinks and paths outside runner temp', () => {
  const cases = [
    {
      prepare(input) {
        return { input, expectedSha: 'b'.repeat(40), error: /SHA does not match/i };
      },
    },
    {
      prepare(input) {
        chmodSync(path.join(input.artifact, 'critical.txt'), 0o664);
        return { input, expectedSha: sha, error: /must not be group- or world-writable/i };
      },
    },
    {
      prepare(input) {
        symlinkSync('critical.txt', path.join(input.artifact, 'linked.txt'));
        return { input, expectedSha: sha, error: /must not contain symbolic links/i };
      },
    },
    {
      prepare(input) {
        input.runnerTemp = path.join(input.root, 'different-temp');
        mkdirSync(input.runnerTemp);
        return { input, expectedSha: sha, error: /dedicated runner temp/i };
      },
    },
  ];

  for (const { prepare } of cases) {
    const fixtureInput = fixture();
    try {
      const { input, expectedSha, error } = prepare(fixtureInput);
      const result = run(input, expectedSha);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, error);
    } finally {
      rmSync(fixtureInput.root, { recursive: true, force: true });
    }
  }
});
