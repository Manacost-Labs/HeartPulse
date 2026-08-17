import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const MODULE_INVENTORY_PATH = 'config/module-boundaries.json';
export const MODULE_EXCEPTION_GROUPS = [
  'missingPublicEntry',
  'internalImport',
  'moduleLegacyImport',
  'runtimeCrossing',
  'typeCycle',
];

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

export function readModuleInventory(root, inventoryPath = MODULE_INVENTORY_PATH) {
  let inventoryFile;
  try {
    inventoryFile = resolveRepositoryFile(root, inventoryPath, { required: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('is missing')) {
      throw new Error(
        `Module inventory is missing at ${inventoryPath}. Run the Phase 0 module inventory task first.`,
      );
    }
    throw error;
  }
  if (!inventoryFile) {
    throw new Error(
      `Module inventory is missing at ${inventoryPath}. Run the Phase 0 module inventory task first.`,
    );
  }

  let inventory;
  try {
    inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'));
  } catch (error) {
    throw new Error(
      `Module inventory is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!inventory || typeof inventory !== 'object'
    || inventory.schemaVersion !== 1 || !Array.isArray(inventory.modules)) {
    throw new Error('Module inventory must use schemaVersion 1 and contain a modules array.');
  }
  return inventory;
}

export function pathBelongsToModule(candidate, module) {
  if (typeof candidate !== 'string') return false;
  return candidate === module.id
    || candidate === module.root
    || candidate.startsWith(`${module.root}/`);
}

function exceptionBelongsToModule(category, exception, module) {
  if (category === 'missingPublicEntry') {
    return exception.module === module.id
      || pathBelongsToModule(exception.source, module)
      || pathBelongsToModule(exception.target, module);
  }
  if (category === 'typeCycle') {
    return (exception.nodes ?? []).some(node => pathBelongsToModule(node, module))
      || (exception.edges ?? []).some(edge => (
        pathBelongsToModule(edge.source, module) || pathBelongsToModule(edge.target, module)
      ));
  }
  return pathBelongsToModule(exception.source, module)
    || pathBelongsToModule(exception.target, module);
}

export function relevantModuleExceptions(inventory, module) {
  const groups = inventory.exceptions ?? {};
  const relevant = [];
  for (const category of MODULE_EXCEPTION_GROUPS) {
    if (!Array.isArray(groups[category])) continue;
    for (const exception of groups[category]) {
      if (exceptionBelongsToModule(category, exception, module)) {
        relevant.push({ category, ...exception });
      }
    }
  }
  return relevant;
}

export function moduleBySelector(inventory, selector, root) {
  const normalizedSelector = normalizeRepositoryPath(selector, root);
  const module = inventory.modules.find(candidate => (
    candidate.id === selector
    || normalizeRepositoryPath(candidate.root, root) === normalizedSelector
  ));
  if (!module) {
    const choices = inventory.modules.map(candidate => candidate.id).sort().join(', ');
    throw new Error(`Unknown module "${selector}". Available module ids: ${choices || '(none)'}.`);
  }
  return {
    ...module,
    root: normalizeRepositoryPath(module.root, root),
  };
}
