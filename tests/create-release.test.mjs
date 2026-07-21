import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = mkdtempSync(join(tmpdir(), 'hs-arena-release-test-'));
const workspace = join(root, 'workspace');
const output = join(root, 'artifact');
const nginxContractFiles = [
  'deploy/nginx/arena-html-routing.conf',
  'deploy/nginx/arena-seo-map.conf',
  'deploy/nginx/arena-edge-static-cache.conf',
  'deploy/nginx/arena-canonical-host-redirect.conf',
  'deploy/nginx/arena-security-headers.conf',
];

try {
  for (const directory of ['build/server', 'dist', 'public', 'server', 'scripts', 'deploy/nginx']) {
    mkdirSync(join(workspace, directory), { recursive: true });
  }
  writeFileSync(join(workspace, 'build/server/index.js'), 'console.log("server");\n');
  writeFileSync(join(workspace, 'dist/index.html'), '<!doctype html>\n<script type="module" src="/assets/index-stable.js"></script>\n');
  writeFileSync(join(workspace, 'public/asset.txt'), 'asset\n');
  writeFileSync(join(workspace, 'server/gen_legendary_image.py'), '# fixture\n');
  for (const script of ['backup-shared-data.sh', 'verify-backup.sh', 'restore-backup.sh', 'replicate-backup.sh']) {
    writeFileSync(join(workspace, 'scripts', script), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  }
  writeFileSync(join(workspace, 'package.json'), '{"name":"fixture"}\n');
  writeFileSync(join(workspace, 'package-lock.json'), '{"lockfileVersion":3}\n');
  for (const [index, file] of nginxContractFiles.entries()) {
    writeFileSync(join(workspace, file), `# nginx fixture ${index}\n`);
  }

  const result = spawnSync(process.execPath, [
    join(repository, 'scripts/create-release.mjs'),
    `--output=${output}`,
    '--sha=abcdef1',
  ], { cwd: workspace, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const manifest = JSON.parse(readFileSync(join(output, 'release.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.sha, 'abcdef1');
  assert.match(
    readFileSync(join(output, 'dist/index.html'), 'utf8'),
    /src="\/assets\/index-stable\.js\?v=abcdef1"/,
  );
  assert.match(manifest.checksums['scripts/backup-shared-data.sh'], /^[a-f0-9]{64}$/);
  assert.match(manifest.checksums['scripts/verify-backup.sh'], /^[a-f0-9]{64}$/);
  assert.match(manifest.checksums['scripts/restore-backup.sh'], /^[a-f0-9]{64}$/);
  assert.match(manifest.checksums['scripts/replicate-backup.sh'], /^[a-f0-9]{64}$/);
  assert.equal(manifest.nginxContract.schemaVersion, 1);
  assert.match(manifest.nginxContract.hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(manifest.nginxContract.files.map(file => file.source), nginxContractFiles);
  assert.deepEqual(
    manifest.nginxContract.files.map(file => file.roles),
    [['origin'], ['origin'], ['edge'], ['origin'], ['origin']],
  );
  assert.deepEqual(
    manifest.nginxContract.files.map(file => file.installPath),
    [
      '/etc/nginx/snippets/arena-html-routing.conf',
      '/etc/nginx/conf.d/31-arena-seo-map.conf',
      '/etc/nginx/snippets/arena-edge-static-cache.conf',
      '/etc/nginx/snippets/arena-canonical-host-redirect.conf',
      '/etc/nginx/snippets/arena-security-headers.conf',
    ],
  );
  const expectedContractHash = createHash('sha256')
    .update(manifest.nginxContract.files
      .map(file => `${file.source}\0${file.installPath}\0${file.roles.join(',')}\0${file.sha256}\n`)
      .join(''))
    .digest('hex');
  assert.equal(manifest.nginxContract.hash, expectedContractHash);
  for (const file of nginxContractFiles) {
    assert.equal(readFileSync(join(output, file), 'utf8'), readFileSync(join(workspace, file), 'utf8'));
    assert.equal(
      manifest.nginxContract.files.find(contractFile => contractFile.source === file).sha256,
      manifest.checksums[file],
    );
    assert.match(manifest.checksums[file], /^[a-f0-9]{64}$/);
  }
  for (const script of ['backup-shared-data.sh', 'verify-backup.sh', 'restore-backup.sh', 'replicate-backup.sh']) {
    assert.ok((statSync(join(output, 'scripts', script)).mode & 0o111) !== 0, `${script} is not executable`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('release artifact recovery-script tests passed');
