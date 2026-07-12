import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = mkdtempSync(join(tmpdir(), 'hs-arena-release-test-'));
const workspace = join(root, 'workspace');
const output = join(root, 'artifact');

try {
  for (const directory of ['build/server', 'dist', 'public', 'server', 'scripts']) {
    mkdirSync(join(workspace, directory), { recursive: true });
  }
  writeFileSync(join(workspace, 'build/server/index.js'), 'console.log("server");\n');
  writeFileSync(join(workspace, 'dist/index.html'), '<!doctype html>\n');
  writeFileSync(join(workspace, 'public/asset.txt'), 'asset\n');
  writeFileSync(join(workspace, 'server/gen_legendary_image.py'), '# fixture\n');
  for (const script of ['backup-shared-data.sh', 'verify-backup.sh', 'restore-backup.sh', 'replicate-backup.sh']) {
    writeFileSync(join(workspace, 'scripts', script), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  }
  writeFileSync(join(workspace, 'package.json'), '{"name":"fixture"}\n');
  writeFileSync(join(workspace, 'package-lock.json'), '{"lockfileVersion":3}\n');

  const result = spawnSync(process.execPath, [
    join(repository, 'scripts/create-release.mjs'),
    `--output=${output}`,
    '--sha=abcdef1',
  ], { cwd: workspace, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const manifest = JSON.parse(readFileSync(join(output, 'release.json'), 'utf8'));
  assert.equal(manifest.sha, 'abcdef1');
  assert.match(manifest.checksums['scripts/backup-shared-data.sh'], /^[a-f0-9]{64}$/);
  assert.match(manifest.checksums['scripts/verify-backup.sh'], /^[a-f0-9]{64}$/);
  assert.match(manifest.checksums['scripts/restore-backup.sh'], /^[a-f0-9]{64}$/);
  assert.match(manifest.checksums['scripts/replicate-backup.sh'], /^[a-f0-9]{64}$/);
  for (const script of ['backup-shared-data.sh', 'verify-backup.sh', 'restore-backup.sh', 'replicate-backup.sh']) {
    assert.ok((statSync(join(output, 'scripts', script)).mode & 0o111) !== 0, `${script} is not executable`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('release artifact recovery-script tests passed');
