import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = mkdtempSync(join(tmpdir(), 'hs-arena-deploy-test-'));
const appBase = join(root, 'app-base');
const workspace = join(root, 'workspace');
const installedRoot = join(root, 'installed-root');
const installedConfig = join(installedRoot, 'etc', 'nginx', 'snippets', 'arena-test.conf');
const verifier = join(repository, 'scripts', 'verify-nginx-contract.mjs');
const defaultNginxContents = '# managed nginx fixture\n';
mkdirSync(join(workspace, 'node_modules'), { recursive: true });
mkdirSync(join(workspace, 'server', 'data'), { recursive: true });
mkdirSync(dirname(installedConfig), { recursive: true });
writeFileSync(join(workspace, 'server', 'data', 'snapshot.json'), '{}');
writeFileSync(installedConfig, defaultNginxContents);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function contractHash(files) {
  return sha256(files
    .map(file => `${file.source}\0${file.installPath}\0${file.roles.join(',')}\0${file.sha256}\n`)
    .join(''));
}

function fakeRelease(sha, { nginxContents = defaultNginxContents } = {}) {
  const directory = join(root, `artifact-${sha}`);
  const nginxSource = 'deploy/nginx/arena-test.conf';
  const verifierSource = 'scripts/verify-nginx-contract.mjs';
  mkdirSync(join(directory, 'build', 'server'), { recursive: true });
  mkdirSync(join(directory, 'dist'), { recursive: true });
  mkdirSync(join(directory, 'dist', 'assets'), { recursive: true });
  mkdirSync(dirname(join(directory, nginxSource)), { recursive: true });
  mkdirSync(dirname(join(directory, verifierSource)), { recursive: true });
  writeFileSync(join(directory, 'build', 'server', 'index.js'), '');
  writeFileSync(join(directory, 'dist', 'index.html'), '');
  writeFileSync(join(directory, 'dist', 'runtime-config.js'), 'window.defaultConfig = true;\n');
  writeFileSync(join(directory, 'dist', 'assets', `asset-${sha}.js`), sha);
  writeFileSync(join(directory, 'package.json'), '{}');
  writeFileSync(join(directory, 'package-lock.json'), '{}');
  writeFileSync(join(directory, nginxSource), nginxContents);
  copyFileSync(verifier, join(directory, verifierSource));
  const files = [{
    source: nginxSource,
    installPath: '/etc/nginx/snippets/arena-test.conf',
    roles: ['origin'],
    sha256: sha256(nginxContents),
  }];
  writeFileSync(join(directory, 'release.json'), JSON.stringify({
    schemaVersion: 2,
    sha,
    packageLockHash: 'a'.repeat(64),
    checksums: {
      [nginxSource]: files[0].sha256,
      [verifierSource]: sha256(readFileSync(join(directory, verifierSource))),
    },
    nginxContract: {
      schemaVersion: 1,
      hash: contractHash(files),
      files,
    },
  }));
  return directory;
}

function deploy(artifact, readiness, options = {}) {
  return spawnSync('bash', ['scripts/deploy-release.sh', artifact], {
    cwd: repository,
    encoding: 'utf8',
    env: {
      ...process.env,
      APP_BASE: appBase,
      READY_ATTEMPTS: '1',
      READY_DELAY_SECONDS: '0',
      READINESS_COMMAND: readiness ? 'true' : 'false',
      RESTART_COMMAND: options.restartCommand || 'true',
      SKIP_DEPENDENCIES: '1',
      SKIP_IMMUTABLE_PERMISSIONS: '1',
      WORKSPACE: workspace,
      NGINX_HOST_ROLE: 'origin',
      NGINX_INSTALLED_ROOT: installedRoot,
      ALLOW_NGINX_CONTRACT_CHANGE: options.allowNginxContractChange ? '1' : '0',
    },
  });
}

function treeSnapshot(path) {
  if (!existsSync(path)) return null;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return { type: 'link', target: readlinkSync(path) };
  if (stat.isDirectory()) {
    return {
      type: 'directory',
      entries: Object.fromEntries(readdirSync(path).sort()
        .map(entry => [entry, treeSnapshot(join(path, entry))])),
    };
  }
  return {
    type: 'file',
    contents: readFileSync(path).toString('base64'),
    mode: stat.mode,
  };
}

function assertPreflightFailureIsReadOnly({ artifact, options = {}, message }) {
  const restartMarker = join(root, `restart-${message.replaceAll(/[^a-z0-9]+/gi, '-')}`);
  const before = treeSnapshot(appBase);
  const result = deploy(artifact, true, {
    ...options,
    restartCommand: `touch ${restartMarker}`,
  });
  assert.notEqual(result.status, 0, `${message}: deploy unexpectedly succeeded`);
  assert.deepEqual(treeSnapshot(appBase), before, `${message}: preflight mutated deployment state`);
  assert.equal(existsSync(restartMarker), false, `${message}: preflight restarted the service`);
  return result;
}

try {
  const bootstrapBlocked = assertPreflightFailureIsReadOnly({
    artifact: fakeRelease('0'.repeat(7)),
    message: 'current release absent without explicit bootstrap override',
  });
  assert.match(bootstrapBlocked.stderr, /current release has no versioned nginx contract/i);
  assert.equal(existsSync(appBase), false, 'bootstrap preflight must not create APP_BASE');

  rmSync(join(workspace, 'node_modules'), { recursive: true });
  const preparationSha = 'd'.repeat(7);
  const preparationFailure = deploy(fakeRelease(preparationSha), true, { allowNginxContractChange: true });
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
  const first = deploy(firstArtifact, true, { allowNginxContractChange: true });
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const firstTarget = resolve(appBase, 'releases', firstSha);
  assert.equal(resolve(appBase, readlinkSync(join(appBase, 'current'))), firstTarget);

  const secondSha = 'b'.repeat(7);
  const runtimeClientConfig = join(appBase, 'runtime', 'client-config.js');
  writeFileSync(runtimeClientConfig, 'window.sharedConfig = true;\n');
  const second = deploy(fakeRelease(secondSha), true);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  const secondTarget = resolve(appBase, 'releases', secondSha);
  assert.equal(resolve(appBase, readlinkSync(join(appBase, 'current'))), secondTarget);
  assert.equal(resolve(appBase, readlinkSync(join(appBase, 'previous'))), firstTarget);
  assert.equal(readFileSync(join(secondTarget, 'dist', 'assets', `asset-${firstSha}.js`), 'utf8'), firstSha);
  assert.equal(readFileSync(join(secondTarget, 'dist', 'assets', `asset-${secondSha}.js`), 'utf8'), secondSha);
  assert.equal(existsSync(join(secondTarget, 'dist', 'assets', 'stale.js')), false);
  assert.equal(lstatSync(join(secondTarget, 'dist', 'runtime-config.js')).isSymbolicLink(), true);
  assert.equal(readlinkSync(join(secondTarget, 'dist', 'runtime-config.js')), runtimeClientConfig);
  assert.equal(readFileSync(join(secondTarget, 'dist', 'runtime-config.js'), 'utf8'), 'window.sharedConfig = true;\n');

  const repeated = deploy(fakeRelease(secondSha), true);
  assert.equal(repeated.status, 0, repeated.stderr || repeated.stdout);
  assert.equal(resolve(appBase, readlinkSync(join(appBase, 'current'))), secondTarget);

  const failedSha = 'c'.repeat(7);
  const failed = deploy(fakeRelease(failedSha), false);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /rolling back/);
  assert.equal(resolve(appBase, readlinkSync(join(appBase, 'current'))), secondTarget);
  assert.equal(resolve(appBase, readlinkSync(join(appBase, 'previous'))), firstTarget);

  const missingSha = 'e'.repeat(7);
  unlinkSync(installedConfig);
  const installedMissing = assertPreflightFailureIsReadOnly({
    artifact: fakeRelease(missingSha),
    options: { allowNginxContractChange: true },
    message: 'installed nginx file missing',
  });
  assert.match(`${installedMissing.stdout}\n${installedMissing.stderr}`, /installed-missing|nginx contract/i);
  writeFileSync(installedConfig, defaultNginxContents);

  const modifiedSha = 'f'.repeat(7);
  writeFileSync(installedConfig, '# unmanaged local edit\n');
  const installedModified = assertPreflightFailureIsReadOnly({
    artifact: fakeRelease(modifiedSha),
    options: { allowNginxContractChange: true },
    message: 'installed nginx file modified',
  });
  assert.match(`${installedModified.stdout}\n${installedModified.stderr}`, /installed-modified|nginx contract/i);
  writeFileSync(installedConfig, defaultNginxContents);

  const corruptSha = '1'.repeat(7);
  const corruptArtifact = fakeRelease(corruptSha);
  writeFileSync(join(corruptArtifact, 'deploy', 'nginx', 'arena-test.conf'), '# corrupted artifact\n');
  const corrupt = assertPreflightFailureIsReadOnly({
    artifact: corruptArtifact,
    options: { allowNginxContractChange: true },
    message: 'candidate nginx artifact corrupt',
  });
  assert.match(`${corrupt.stdout}\n${corrupt.stderr}`, /artifact-modified|nginx contract/i);

  const tamperedVerifierSha = '5'.repeat(7);
  const tamperedVerifierArtifact = fakeRelease(tamperedVerifierSha);
  const tamperedVerifierMarker = join(root, 'tampered-verifier-executed');
  writeFileSync(
    join(tamperedVerifierArtifact, 'scripts', 'verify-nginx-contract.mjs'),
    `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(tamperedVerifierMarker)}, 'executed');\n`,
  );
  const tamperedVerifier = assertPreflightFailureIsReadOnly({
    artifact: tamperedVerifierArtifact,
    options: { allowNginxContractChange: true },
    message: 'candidate nginx verifier tampered',
  });
  assert.match(tamperedVerifier.stderr, /nginx contract verifier checksum/i);
  assert.equal(existsSync(tamperedVerifierMarker), false, 'a tampered verifier must never execute');

  const changedContents = '# next managed nginx contract\n';
  const changedSha = '2'.repeat(7);
  const changedArtifact = fakeRelease(changedSha, { nginxContents: changedContents });
  writeFileSync(installedConfig, changedContents);
  const changedBlocked = assertPreflightFailureIsReadOnly({
    artifact: changedArtifact,
    message: 'candidate and current nginx hashes differ',
  });
  assert.match(changedBlocked.stderr, /nginx contract change/i);

  const changedAllowed = deploy(changedArtifact, true, { allowNginxContractChange: true });
  assert.equal(changedAllowed.status, 0, changedAllowed.stderr || changedAllowed.stdout);
  const changedTarget = resolve(appBase, 'releases', changedSha);
  assert.equal(resolve(appBase, readlinkSync(join(appBase, 'current'))), changedTarget);

  const legacyDirectory = join(root, 'legacy-current');
  mkdirSync(legacyDirectory, { recursive: true });
  writeFileSync(join(legacyDirectory, 'release.json'), JSON.stringify({
    schemaVersion: 1,
    sha: '3'.repeat(7),
    packageLockHash: 'a'.repeat(64),
  }));
  unlinkSync(join(appBase, 'current'));
  symlinkSync(legacyDirectory, join(appBase, 'current'));
  const legacyCandidateSha = '4'.repeat(7);
  const legacyCandidate = fakeRelease(legacyCandidateSha, { nginxContents: changedContents });
  const legacyBlocked = assertPreflightFailureIsReadOnly({
    artifact: legacyCandidate,
    message: 'legacy current nginx contract unmanaged',
  });
  assert.match(legacyBlocked.stderr, /nginx contract is legacy or invalid/i);
  const legacyAllowed = deploy(legacyCandidate, true, { allowNginxContractChange: true });
  assert.equal(legacyAllowed.status, 0, legacyAllowed.stderr || legacyAllowed.stdout);
  assert.equal(
    resolve(appBase, readlinkSync(join(appBase, 'current'))),
    resolve(appBase, 'releases', legacyCandidateSha),
  );

  console.log('deployment switch, rollback and nginx preflight tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
