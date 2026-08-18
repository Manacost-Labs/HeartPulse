import { execFileSync } from 'node:child_process';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';

import {
  isSafeMetadataText,
  singleLineDisplay,
} from './diagnostic-text-policy.mjs';

export function normalizePath(value) {
  return value.split(path.sep).join('/').replace(/^\.\//, '');
}

export function projectPath(rootDir, absolutePath) {
  return normalizePath(path.relative(rootDir, absolutePath));
}

export function isInside(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}/`);
}

export function isSafeRelativePath(candidate) {
  return isSafeMetadataText(candidate)
    && candidate !== '.'
    && !path.isAbsolute(candidate)
    && !candidate.includes('\\')
    && !/[?*\[\]{}]/.test(candidate)
    && candidate.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
    && path.posix.normalize(candidate) === candidate;
}

export function repositoryRoot(cwd) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15_000,
  }).trim();
}

export function normalizeRepositoryPath(value, root) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const relative = path.isAbsolute(raw) ? path.relative(root, raw) : raw;
  return path.posix.normalize(relative.replaceAll('\\', '/')).replace(/^\.\//, '').replace(/\/$/, '');
}

function resolveOwnedPath(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Inventory path escapes the repository: ${relativePath}`);
  }
  return resolved;
}

export function resolveRepositoryFile(root, relativePath, { required }) {
  const absolutePath = resolveOwnedPath(root, relativePath);
  if (!existsSync(absolutePath)) {
    if (required) throw new Error(`Required repository file is missing: ${relativePath}`);
    return null;
  }
  const stats = lstatSync(absolutePath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Repository file must be a regular file, not a symlink: ${relativePath}`);
  }
  const realRoot = realpathSync(root);
  const realFile = realpathSync(absolutePath);
  const realRelative = path.relative(realRoot, realFile);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`Repository file resolves outside the repository: ${relativePath}`);
  }
  return realFile;
}

export function readCanonicalRepositoryTextFile({
  rootDir,
  repositoryPath,
  subject = 'Repository file',
}) {
  const displayPath = singleLineDisplay(repositoryPath);
  if (!isSafeRelativePath(repositoryPath) || path.win32.isAbsolute(repositoryPath)) {
    throw new Error(`${subject} path must be a canonical repository-relative path: ${displayPath}`);
  }

  const realRoot = realpathSync(rootDir);
  if (!lstatSync(realRoot).isDirectory()) {
    throw new Error(`${subject} repository root must be a directory.`);
  }

  let absolutePath = realRoot;
  let stats;
  const segments = repositoryPath.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    absolutePath = path.join(absolutePath, segments[index]);
    try {
      stats = lstatSync(absolutePath);
    } catch (error) {
      if (error && typeof error === 'object' && ['ENOENT', 'ENOTDIR'].includes(error.code)) {
        throw new Error(`${subject} is missing: ${displayPath}`);
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`${subject} path must not contain symbolic links: ${displayPath}`);
    }
    if (index < segments.length - 1 && !stats.isDirectory()) {
      throw new Error(`${subject} parent path must contain only directories: ${displayPath}`);
    }
  }

  if (!stats?.isFile()) {
    throw new Error(`${subject} must be a regular file: ${displayPath}`);
  }
  const realFile = realpathSync(absolutePath);
  const realRelative = path.relative(realRoot, realFile);
  if (realRelative === '..'
    || realRelative.startsWith(`..${path.sep}`)
    || path.isAbsolute(realRelative)) {
    throw new Error(`${subject} must resolve inside the repository: ${displayPath}`);
  }
  if (typeof constants.O_NOFOLLOW !== 'number') {
    throw new Error(`${subject} cannot be opened safely on this platform.`);
  }

  let descriptor;
  try {
    descriptor = openSync(realFile, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openedStats = fstatSync(descriptor);
    if (!openedStats.isFile()) {
      throw new Error(`${subject} must be a regular file: ${displayPath}`);
    }
    if (openedStats.dev !== stats.dev || openedStats.ino !== stats.ino) {
      throw new Error(`${subject} changed while it was being opened: ${displayPath}`);
    }
    return readFileSync(descriptor, 'utf8');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function strictRepositorySelectorPath(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Module or path selector must not be empty.');
  if (!isSafeMetadataText(raw)) {
    throw new Error('Repository path selector is not safe: control characters are forbidden.');
  }
  if (raw.includes('\\') || path.posix.isAbsolute(raw)) {
    throw new Error(`Repository path selector is not safe: ${raw}`);
  }
  const withoutPrefix = raw.replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
  const segments = withoutPrefix.split('/');
  if (!withoutPrefix || segments.includes('..') || segments.includes('.')) {
    throw new Error(`Repository path selector is not safe: ${raw}`);
  }
  const normalized = path.posix.normalize(withoutPrefix);
  if (normalized !== withoutPrefix) {
    throw new Error(`Repository path selector must already be normalized: ${raw}`);
  }
  return normalized;
}

export function resolveRepositoryPath(root, relativePath, { required = true } = {}) {
  const normalized = strictRepositorySelectorPath(relativePath);
  const absolutePath = resolveOwnedPath(root, normalized);
  if (!existsSync(absolutePath)) {
    if (required) throw new Error(`Repository path does not exist: ${normalized}`);
    return null;
  }
  const stats = lstatSync(absolutePath);
  if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory())) {
    throw new Error(`Repository path must be a regular file or directory, not a symlink: ${normalized}`);
  }
  const realRoot = realpathSync(root);
  const realEntry = realpathSync(absolutePath);
  const realRelative = path.relative(realRoot, realEntry);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`Repository path resolves outside the repository: ${normalized}`);
  }
  return normalized;
}

export function repositoryEntryKind(rootDir, repositoryPath) {
  if (!isSafeRelativePath(repositoryPath)) return null;
  const absoluteRoot = realpathSync(rootDir);
  const absoluteEntry = path.resolve(rootDir, repositoryPath);
  let stats;
  try {
    stats = lstatSync(absoluteEntry);
  } catch {
    return null;
  }
  if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory())) return null;
  let realEntry;
  try {
    realEntry = realpathSync(absoluteEntry);
  } catch {
    return null;
  }
  const realRelative = path.relative(absoluteRoot, realEntry);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) return null;
  return stats.isFile() ? 'file' : 'directory';
}

export function repositoryEntryResolvesWithin(rootDir, repositoryPath, ownerRoot) {
  if (!isSafeRelativePath(repositoryPath) || !isSafeRelativePath(ownerRoot)) return false;
  try {
    const realEntry = realpathSync(path.resolve(rootDir, repositoryPath));
    const realOwnerRoot = realpathSync(path.resolve(rootDir, ownerRoot));
    const ownedRelative = path.relative(realOwnerRoot, realEntry);
    return ownedRelative === ''
      || (!ownedRelative.startsWith('..') && !path.isAbsolute(ownedRelative));
  } catch {
    return false;
  }
}
