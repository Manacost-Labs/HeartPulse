#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_RELEASE_ROOT = '/var/www/koloda/data/www/hs-arena.ru/current';
const DEFAULT_INSTALLED_ROOT = '/';
const DEFAULT_ROLE = 'origin';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function aggregateContractHash(files) {
  return sha256(files
    .map(file => `${file.source}\0${file.installPath}\0${file.roles.join(',')}\0${file.sha256}\n`)
    .join(''));
}

function emptyReport({ releaseRoot, installedRoot, role }) {
  return {
    status: 'invalid',
    exitCode: 2,
    releaseRoot: resolve(releaseRoot),
    installedRoot: resolve(installedRoot),
    role,
    release: null,
    contractHash: null,
    files: [],
    issues: [],
  };
}

function pathInside(root, relativePath) {
  const absoluteRoot = resolve(root);
  const candidate = resolve(absoluteRoot, relativePath);
  const relation = relative(absoluteRoot, candidate);
  if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`path escapes its root: ${relativePath}`);
  }
  return candidate;
}

function readHash(path) {
  try {
    return { status: 'ok', sha256: sha256(readFileSync(path)) };
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return { status: 'missing', sha256: null };
    }
    return {
      status: 'unreadable',
      sha256: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function invalid(report, type, details = {}) {
  report.status = 'invalid';
  report.exitCode = 2;
  report.issues.push({ type, ...details });
  return report;
}

function validateContractFile(file, index) {
  if (!file || typeof file !== 'object' || Array.isArray(file)) {
    return `nginxContract.files[${index}] must be an object`;
  }
  if (typeof file.source !== 'string'
    || file.source.length === 0
    || isAbsolute(file.source)
    || file.source.split('/').includes('..')) {
    return `nginxContract.files[${index}].source must be a safe relative path`;
  }
  if (typeof file.installPath !== 'string'
    || !file.installPath.startsWith('/')
    || file.installPath.split('/').includes('..')) {
    return `nginxContract.files[${index}].installPath must be a safe absolute path`;
  }
  if (!Array.isArray(file.roles)
    || file.roles.length === 0
    || file.roles.some(role => typeof role !== 'string' || !/^[a-z][a-z0-9-]*$/.test(role))) {
    return `nginxContract.files[${index}].roles must contain valid role names`;
  }
  if (typeof file.sha256 !== 'string' || !SHA256_PATTERN.test(file.sha256)) {
    return `nginxContract.files[${index}].sha256 must be a lowercase SHA-256 hash`;
  }
  return null;
}

/**
 * Compare the immutable nginx contract in a release with files installed for
 * one host role. This function performs reads and hashes only; it never writes,
 * installs, reloads or invokes nginx.
 */
export function verifyNginxContract(options = {}) {
  const releaseRoot = resolve(options.releaseRoot || DEFAULT_RELEASE_ROOT);
  const installedRoot = resolve(options.installedRoot || DEFAULT_INSTALLED_ROOT);
  const role = String(options.role || DEFAULT_ROLE);
  const report = emptyReport({ releaseRoot, installedRoot, role });

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(pathInside(releaseRoot, 'release.json'), 'utf8'));
  } catch (error) {
    return invalid(report, 'release-manifest-unreadable', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  report.release = typeof manifest?.sha === 'string' ? manifest.sha : null;
  if (manifest?.schemaVersion === 1 && !manifest?.nginxContract) {
    report.status = 'unmanaged';
    report.exitCode = 2;
    report.issues.push({ type: 'legacy-release-manifest' });
    return report;
  }
  if (manifest?.schemaVersion !== 2) {
    return invalid(report, 'unsupported-release-schema', { schemaVersion: manifest?.schemaVersion ?? null });
  }
  if (manifest?.nginxContract?.schemaVersion !== 1) {
    return invalid(report, 'unsupported-nginx-contract-schema', {
      schemaVersion: manifest?.nginxContract?.schemaVersion ?? null,
    });
  }
  if (!SHA256_PATTERN.test(String(manifest.nginxContract.hash || ''))) {
    return invalid(report, 'invalid-aggregate-hash');
  }
  if (!Array.isArray(manifest.nginxContract.files) || manifest.nginxContract.files.length === 0) {
    return invalid(report, 'invalid-contract-files');
  }

  const files = manifest.nginxContract.files;
  const seenSources = new Set();
  const seenInstallPaths = new Set();
  for (let index = 0; index < files.length; index += 1) {
    const validationError = validateContractFile(files[index], index);
    if (validationError) return invalid(report, 'invalid-contract-file', { index, message: validationError });
    if (seenSources.has(files[index].source)) {
      return invalid(report, 'duplicate-contract-source', { source: files[index].source });
    }
    if (seenInstallPaths.has(files[index].installPath)) {
      return invalid(report, 'duplicate-install-path', { installPath: files[index].installPath });
    }
    seenSources.add(files[index].source);
    seenInstallPaths.add(files[index].installPath);
    if (manifest.checksums?.[files[index].source] !== files[index].sha256) {
      return invalid(report, 'manifest-checksum-mismatch', { source: files[index].source });
    }
  }

  const knownRoles = new Set(files.flatMap(file => file.roles));
  if (!knownRoles.has(role)) {
    return invalid(report, 'unknown-role', { role, knownRoles: [...knownRoles].sort() });
  }

  const aggregateHash = aggregateContractHash(files);
  report.contractHash = manifest.nginxContract.hash;
  if (aggregateHash !== manifest.nginxContract.hash) {
    return invalid(report, 'aggregate-hash-mismatch', {
      expected: manifest.nginxContract.hash,
      actual: aggregateHash,
    });
  }

  for (const file of files) {
    let artifactPath;
    let installedPath;
    try {
      artifactPath = pathInside(releaseRoot, file.source);
      installedPath = pathInside(installedRoot, file.installPath.replace(/^\/+/, ''));
    } catch (error) {
      return invalid(report, 'contract-path-invalid', {
        source: file.source,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const artifact = readHash(artifactPath);
    const appliesToRole = file.roles.includes(role);
    const fileReport = {
      source: file.source,
      installPath: file.installPath,
      roles: [...file.roles],
      expectedSha256: file.sha256,
      artifactSha256: artifact.sha256,
      artifactStatus: artifact.status === 'ok' && artifact.sha256 === file.sha256
        ? 'ok'
        : artifact.status === 'ok' ? 'modified' : artifact.status,
      installedSha256: null,
      installedStatus: appliesToRole ? 'pending' : 'not-applicable',
    };
    report.files.push(fileReport);

    if (fileReport.artifactStatus !== 'ok') {
      report.issues.push({
        type: fileReport.artifactStatus === 'modified'
          ? 'artifact-modified'
          : `artifact-${fileReport.artifactStatus}`,
        source: file.source,
        expected: file.sha256,
        actual: artifact.sha256,
        ...(artifact.error ? { message: artifact.error } : {}),
      });
    }
  }

  if (report.issues.some(issue => issue.type.startsWith('artifact-'))) {
    report.status = 'invalid';
    report.exitCode = 2;
    return report;
  }

  for (const fileReport of report.files) {
    if (fileReport.installedStatus === 'not-applicable') continue;
    const installedPath = pathInside(installedRoot, fileReport.installPath.replace(/^\/+/, ''));
    const installed = readHash(installedPath);
    fileReport.installedSha256 = installed.sha256;
    fileReport.installedStatus = installed.status === 'ok' && installed.sha256 === fileReport.expectedSha256
      ? 'ok'
      : installed.status === 'ok' ? 'modified' : installed.status;
    if (fileReport.installedStatus !== 'ok') {
      report.issues.push({
        type: fileReport.installedStatus === 'modified'
          ? 'installed-modified'
          : `installed-${fileReport.installedStatus}`,
        source: fileReport.source,
        installPath: fileReport.installPath,
        expected: fileReport.expectedSha256,
        actual: installed.sha256,
        ...(installed.error ? { message: installed.error } : {}),
      });
    }
  }

  if (report.issues.length > 0) {
    report.status = 'drift';
    report.exitCode = 1;
    return report;
  }

  report.status = 'ok';
  report.exitCode = 0;
  return report;
}

function argumentValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length);
}

function main() {
  const report = verifyNginxContract({
    releaseRoot: argumentValue('release') || DEFAULT_RELEASE_ROOT,
    installedRoot: argumentValue('installed-root') || DEFAULT_INSTALLED_ROOT,
    role: argumentValue('role') || DEFAULT_ROLE,
  });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
