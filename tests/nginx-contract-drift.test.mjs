import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyNginxContract } from '../scripts/verify-nginx-contract.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verifierPath = join(repository, 'scripts', 'verify-nginx-contract.mjs');
const root = mkdtempSync(join(tmpdir(), 'hs-arena-nginx-drift-'));

const definitions = [
  {
    source: 'deploy/nginx/arena-html-routing.conf',
    installPath: '/etc/nginx/snippets/arena-html-routing.conf',
    roles: ['origin'],
  },
  {
    source: 'deploy/nginx/arena-seo-map.conf',
    installPath: '/etc/nginx/conf.d/31-arena-seo-map.conf',
    roles: ['origin'],
  },
  {
    source: 'deploy/nginx/arena-card-local-maps.conf',
    installPath: '/etc/nginx/conf.d/31-arena-card-local-maps.conf',
    roles: ['edge'],
  },
  {
    source: 'deploy/nginx/arena-edge-static-cache.conf',
    installPath: '/etc/nginx/snippets/arena-edge-static-cache.conf',
    roles: ['edge'],
  },
  {
    source: 'deploy/nginx/arena-canonical-host-redirect.conf',
    installPath: '/etc/nginx/snippets/arena-canonical-host-redirect.conf',
    roles: ['origin'],
  },
  {
    source: 'deploy/nginx/arena-security-headers.conf',
    installPath: '/etc/nginx/snippets/arena-security-headers.conf',
    roles: ['origin'],
  },
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function contractHash(files) {
  return sha256(files
    .map(file => `${file.source}\0${file.installPath}\0${file.roles.join(',')}\0${file.sha256}\n`)
    .join(''));
}

function rootedInstallPath(installedRoot, installPath) {
  return join(installedRoot, installPath.replace(/^\/+/, ''));
}

function createFixture(name, { installEdge = false } = {}) {
  const fixtureRoot = join(root, name);
  const releaseRoot = join(fixtureRoot, 'release');
  const installedRoot = join(fixtureRoot, 'installed');
  const files = definitions.map((definition, index) => {
    const contents = `# nginx contract fixture ${index}\n`;
    const releasePath = join(releaseRoot, definition.source);
    mkdirSync(dirname(releasePath), { recursive: true });
    writeFileSync(releasePath, contents);

    if (definition.roles.includes('origin') || installEdge) {
      const installedPath = rootedInstallPath(installedRoot, definition.installPath);
      mkdirSync(dirname(installedPath), { recursive: true });
      writeFileSync(installedPath, contents);
    }

    return { ...definition, sha256: sha256(contents) };
  });
  const checksums = Object.fromEntries(files.map(file => [file.source, file.sha256]));
  const manifest = {
    schemaVersion: 2,
    sha: 'abcdef1234567890',
    checksums,
    nginxContract: {
      schemaVersion: 1,
      hash: contractHash(files),
      files,
    },
  };
  writeFileSync(join(releaseRoot, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { releaseRoot, installedRoot, manifest, files };
}

function installedSnapshot(fixture, role) {
  return Object.fromEntries(fixture.files
    .filter(file => file.roles.includes(role))
    .map(file => {
      const path = rootedInstallPath(fixture.installedRoot, file.installPath);
      const stat = statSync(path, { bigint: true });
      return [file.installPath, {
        contents: readFileSync(path, 'utf8'),
        mode: stat.mode,
        mtimeNs: stat.mtimeNs,
        size: stat.size,
      }];
    }));
}

function runCli(fixture, role = 'origin') {
  return spawnSync(process.execPath, [
    verifierPath,
    `--release=${fixture.releaseRoot}`,
    `--installed-root=${fixture.installedRoot}`,
    `--role=${role}`,
  ], { encoding: 'utf8' });
}

try {
  const originFixture = createFixture('origin');
  const beforeFunction = installedSnapshot(originFixture, 'origin');
  const originReport = verifyNginxContract({
    releaseRoot: originFixture.releaseRoot,
    installedRoot: originFixture.installedRoot,
    role: 'origin',
  });
  assert.equal(originReport.status, 'ok');
  assert.equal(originReport.exitCode, 0);
  assert.equal(originReport.files.filter(file => file.installedStatus === 'ok').length, 4);
  assert.equal(
    originReport.files.find(file => file.roles.includes('edge')).installedStatus,
    'not-applicable',
  );
  assert.deepEqual(installedSnapshot(originFixture, 'origin'), beforeFunction,
    'the function must not change installed file contents, mode or mtime');

  const beforeCli = installedSnapshot(originFixture, 'origin');
  const originCli = runCli(originFixture);
  assert.equal(originCli.status, 0, originCli.stderr || originCli.stdout);
  assert.equal(JSON.parse(originCli.stdout).status, 'ok');
  assert.deepEqual(installedSnapshot(originFixture, 'origin'), beforeCli,
    'the CLI must be read-only for installed files');

  const edgeMissing = verifyNginxContract({
    releaseRoot: originFixture.releaseRoot,
    installedRoot: originFixture.installedRoot,
    role: 'edge',
  });
  assert.equal(edgeMissing.status, 'drift');
  assert.equal(edgeMissing.exitCode, 1);
  assert.ok(edgeMissing.issues.some(issue => issue.type === 'installed-missing'
    && issue.source.endsWith('arena-edge-static-cache.conf')));
  const edgeMissingCli = runCli(originFixture, 'edge');
  assert.equal(edgeMissingCli.status, 1, edgeMissingCli.stderr || edgeMissingCli.stdout);

  const completeFixture = createFixture('complete', { installEdge: true });
  const edgeReport = verifyNginxContract({
    releaseRoot: completeFixture.releaseRoot,
    installedRoot: completeFixture.installedRoot,
    role: 'edge',
  });
  assert.equal(edgeReport.status, 'ok');
  assert.equal(edgeReport.exitCode, 0);
  assert.equal(edgeReport.files.filter(file => file.installedStatus === 'ok').length, 2);

  const installedModifiedFixture = createFixture('installed-modified');
  const installedModifiedFile = installedModifiedFixture.files.find(file => file.roles.includes('origin'));
  writeFileSync(
    rootedInstallPath(installedModifiedFixture.installedRoot, installedModifiedFile.installPath),
    '# locally changed nginx file\n',
  );
  const installedModified = verifyNginxContract({
    releaseRoot: installedModifiedFixture.releaseRoot,
    installedRoot: installedModifiedFixture.installedRoot,
    role: 'origin',
  });
  assert.equal(installedModified.status, 'drift');
  assert.equal(installedModified.exitCode, 1);
  assert.ok(installedModified.issues.some(issue => issue.type === 'installed-modified'));
  assert.equal(runCli(installedModifiedFixture).status, 1);

  const installedMissingFixture = createFixture('installed-missing');
  const installedMissingFile = installedMissingFixture.files.find(file => file.roles.includes('origin'));
  unlinkSync(rootedInstallPath(installedMissingFixture.installedRoot, installedMissingFile.installPath));
  const installedMissing = verifyNginxContract({
    releaseRoot: installedMissingFixture.releaseRoot,
    installedRoot: installedMissingFixture.installedRoot,
    role: 'origin',
  });
  assert.equal(installedMissing.status, 'drift');
  assert.equal(installedMissing.exitCode, 1);
  assert.ok(installedMissing.issues.some(issue => issue.type === 'installed-missing'));

  const artifactFixture = createFixture('artifact-corrupt');
  writeFileSync(
    join(artifactFixture.releaseRoot, artifactFixture.files[0].source),
    '# artifact changed after release creation\n',
  );
  const artifactCorrupt = verifyNginxContract({
    releaseRoot: artifactFixture.releaseRoot,
    installedRoot: artifactFixture.installedRoot,
    role: 'origin',
  });
  assert.equal(artifactCorrupt.status, 'invalid');
  assert.equal(artifactCorrupt.exitCode, 2);
  assert.ok(artifactCorrupt.issues.some(issue => issue.type === 'artifact-modified'));
  assert.equal(runCli(artifactFixture).status, 2);

  const aggregateFixture = createFixture('aggregate-corrupt');
  aggregateFixture.manifest.nginxContract.hash = '0'.repeat(64);
  writeFileSync(
    join(aggregateFixture.releaseRoot, 'release.json'),
    `${JSON.stringify(aggregateFixture.manifest, null, 2)}\n`,
  );
  const aggregateCorrupt = verifyNginxContract({
    releaseRoot: aggregateFixture.releaseRoot,
    installedRoot: aggregateFixture.installedRoot,
    role: 'origin',
  });
  assert.equal(aggregateCorrupt.status, 'invalid');
  assert.equal(aggregateCorrupt.exitCode, 2);
  assert.ok(aggregateCorrupt.issues.some(issue => issue.type === 'aggregate-hash-mismatch'));
  assert.equal(runCli(aggregateFixture).status, 2);

  const legacyRoot = join(root, 'legacy');
  mkdirSync(legacyRoot, { recursive: true });
  writeFileSync(join(legacyRoot, 'release.json'), JSON.stringify({
    schemaVersion: 1,
    sha: '1234567',
  }));
  const legacy = verifyNginxContract({
    releaseRoot: legacyRoot,
    installedRoot: join(root, 'legacy-installed'),
    role: 'origin',
  });
  assert.equal(legacy.status, 'unmanaged');
  assert.equal(legacy.exitCode, 2);
  assert.ok(legacy.issues.some(issue => issue.type === 'legacy-release-manifest'));
  const legacyCli = runCli({ releaseRoot: legacyRoot, installedRoot: join(root, 'legacy-installed') });
  assert.equal(legacyCli.status, 2);
  assert.equal(JSON.parse(legacyCli.stdout).status, 'unmanaged');

  console.log('nginx release contract drift tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
