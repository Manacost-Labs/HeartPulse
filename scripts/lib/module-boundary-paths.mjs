import { lstatSync, realpathSync } from 'node:fs';
import {
  isAbsolute,
  posix,
  relative,
  resolve,
  sep,
} from 'node:path';

import { isSafeMetadataText } from './module-inventory.mjs';

export function normalizePath(path) {
  return path.split(sep).join('/').replace(/^\.\//, '');
}

export function projectPath(rootDir, absolutePath) {
  return normalizePath(relative(rootDir, absolutePath));
}

export function isInside(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

export function isSafeRelativePath(candidate) {
  return isSafeMetadataText(candidate)
    && candidate !== '.'
    && !isAbsolute(candidate)
    && !candidate.includes('\\')
    && !/[?*\[\]{}]/.test(candidate)
    && candidate.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
    && posix.normalize(candidate) === candidate;
}

export function repositoryEntryKind(rootDir, repositoryPath) {
  if (!isSafeRelativePath(repositoryPath)) return null;
  const absoluteRoot = realpathSync(rootDir);
  const absoluteEntry = resolve(rootDir, repositoryPath);
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
  const realRelative = relative(absoluteRoot, realEntry);
  if (realRelative.startsWith('..') || isAbsolute(realRelative)) return null;
  return stats.isFile() ? 'file' : 'directory';
}

export function repositoryEntryResolvesWithin(rootDir, repositoryPath, ownerRoot) {
  if (!isSafeRelativePath(repositoryPath) || !isSafeRelativePath(ownerRoot)) return false;
  try {
    const realEntry = realpathSync(resolve(rootDir, repositoryPath));
    const realOwnerRoot = realpathSync(resolve(rootDir, ownerRoot));
    const ownedRelative = relative(realOwnerRoot, realEntry);
    return ownedRelative === '' || (!ownedRelative.startsWith('..') && !isAbsolute(ownedRelative));
  } catch {
    return false;
  }
}
