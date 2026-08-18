import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { singleLineDisplay } from './module-inventory.mjs';
import { isSafeRelativePath, projectPath } from './module-boundary-paths.mjs';

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
  '.css', '.scss', '.sass', '.less',
]);
const OWNERSHIP_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, '.json', '.py']);

function sourceExtension(path) {
  for (const extension of SOURCE_EXTENSIONS) {
    if (path.endsWith(extension)) return extension;
  }
  return '';
}

function ownershipExtension(path) {
  for (const extension of OWNERSHIP_EXTENSIONS) {
    if (path.endsWith(extension)) return extension;
  }
  return '';
}

function walkFiles(rootDir, {
  roots,
  extensionForPath,
  pathCode,
  pathMessage,
  symlinkCode,
  symlinkMessage,
  projectFiles,
}) {
  const files = [];
  const errors = [];
  const visit = absolutePath => {
    const repositoryPath = projectPath(rootDir, absolutePath);
    if (!isSafeRelativePath(repositoryPath)) {
      errors.push({
        code: pathCode,
        message: `${pathMessage}: ${JSON.stringify(singleLineDisplay(repositoryPath))}`,
      });
      return;
    }
    let stats;
    try {
      stats = lstatSync(absolutePath);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      errors.push({ code: symlinkCode, message: `${symlinkMessage}: ${repositoryPath}` });
      return;
    }
    if (stats.isDirectory()) {
      for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'build' || entry.name === 'dist') continue;
        visit(join(absolutePath, entry.name));
      }
      return;
    }
    if (extensionForPath(absolutePath)) files.push(projectFiles ? repositoryPath : absolutePath);
  };

  for (const root of roots) visit(join(rootDir, root));
  return {
    files: projectFiles
      ? files.sort()
      : files.sort((left, right) => left.localeCompare(right)),
    errors,
  };
}

export function walkSourceFiles(rootDir) {
  return walkFiles(rootDir, {
    roots: ['src', 'server', 'shared'],
    extensionForPath: sourceExtension,
    pathCode: 'unsafe-source-path',
    pathMessage: 'source path must be canonical and single-line',
    symlinkCode: 'unsafe-source-symlink',
    symlinkMessage: 'source trees must not contain symlinks',
    projectFiles: false,
  });
}

export function walkOwnershipFiles(rootDir) {
  return walkFiles(rootDir, {
    roots: ['src', 'server', 'shared', 'public/bg-legacy'],
    extensionForPath: ownershipExtension,
    pathCode: 'unsafe-ownership-path',
    pathMessage: 'ownership path must be canonical and single-line',
    symlinkCode: 'unsafe-migration-source-symlink',
    symlinkMessage: 'migration ownership trees must not contain symlinks',
    projectFiles: true,
  });
}
