/**
 * Chooses which registered test files a change can affect.
 *
 * The decision is a pure function of the changed paths and three repository
 * configs (the test registry, the module inventory and the architecture
 * catalog), so it needs neither git nor the file system:
 *
 * - `none`   only documentation changed (`docs/`, `changelog.d/`, Markdown
 *            outside the code directories);
 * - `subset` every changed file belongs to a module (or a registered test);
 *            the tests of those modules and of every module that depends on
 *            them, transitively, plus the changed test files;
 * - `all`    anything else: shared runtime, tooling, CI, dependencies, configs,
 *            or a file that cannot be attributed to a module.
 *
 * Any doubt resolves to `all`, which is the old behaviour of the pull request
 * run, so a wrong answer can only cost minutes, never hide a failure.
 */
import path from 'node:path';

import {
  moduleForRepositoryPath,
  sharedRootForRepositoryPath,
} from './module-inventory.mjs';

export const AFFECTED_MODES = Object.freeze(['all', 'subset', 'none']);

const DOCS_ROOTS = ['docs', 'changelog.d'];
// Markdown below these directories is read by code, so it is not "just docs".
const CODE_ROOTS = [
  '.github', '.storybook', 'apps', 'config', 'database', 'deploy',
  'public', 'scripts', 'server', 'shared', 'src', 'tests',
];
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs|sh)$/;

function isInside(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}/`);
}

/** Returns a clean repository-relative path, or null when it cannot be trusted. */
function cleanPath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.includes('\0') || trimmed.includes('\\')) return null;
  const normalized = path.posix.normalize(trimmed).replace(/^\.\//, '');
  if (normalized === '.' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return null;
  return normalized.replace(/\/$/, '');
}

function isDocumentation(file) {
  if (DOCS_ROOTS.some(root => isInside(file, root))) return true;
  return file.toLowerCase().endsWith('.md') && !CODE_ROOTS.some(root => isInside(file, root));
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

/**
 * Maps every inventory module id, and every catalog legacy area, to the
 * registered test files that the architecture catalog lists for it.
 */
function indexCatalogTests({ catalog, inventory, registeredFiles }) {
  const testsByOwner = new Map();
  const legacyAreas = [];
  const add = (owner, tests) => {
    if (!testsByOwner.has(owner)) testsByOwner.set(owner, new Set());
    for (const test of tests) if (registeredFiles.has(test)) testsByOwner.get(owner).add(test);
  };
  for (const entry of catalog.modules ?? []) {
    for (const entryPath of entry.paths ?? []) {
      const owner = moduleForRepositoryPath(inventory.modules, entryPath);
      if (owner) add(owner.id, entry.tests ?? []);
    }
  }
  for (const area of catalog.legacyAreas ?? []) {
    const owner = `legacy:${area.name}`;
    legacyAreas.push({ owner, paths: area.paths ?? [] });
    add(owner, area.tests ?? []);
  }
  return { testsByOwner, legacyAreas };
}

/** Modules plus every module that declares a dependency on one of them, transitively. */
export function closeOverDependents(moduleIds, modules) {
  const affected = new Set(moduleIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const module of modules) {
      if (affected.has(module.id)) continue;
      if ((module.dependencies ?? []).some(dependency => affected.has(dependency))) {
        affected.add(module.id);
        grew = true;
      }
    }
  }
  return affected;
}

/**
 * @param {object} input
 * @param {string[]} input.changedFiles repository-relative paths changed by the pull request
 * @param {object} input.registry parsed `tests/test-suites.json`
 * @param {object} input.inventory parsed `config/module-boundaries.json`
 * @param {object} input.catalog parsed `config/architecture-catalog.json`
 * @returns {{mode: 'all'|'subset'|'none', reason: string, files: Record<string, string[]>, affectedModules: string[]}}
 */
export function selectAffectedTests({ changedFiles, registry, inventory, catalog }) {
  const suiteIds = registry.suites.map(suite => suite.id);
  const suiteOfFile = new Map(
    registry.suites.flatMap(suite => suite.files.map(file => [file, suite.id])),
  );
  const registeredFiles = new Set(suiteOfFile.keys());
  const emptySelection = () => Object.fromEntries(suiteIds.map(id => [id, []]));
  const everything = reason => ({
    mode: 'all',
    reason,
    files: Object.fromEntries(registry.suites.map(suite => [suite.id, [...suite.files]])),
    affectedModules: [],
  });

  const { testsByOwner, legacyAreas } = indexCatalogTests({ catalog, inventory, registeredFiles });
  const changedOwners = new Set();
  const changedTests = new Set();
  let documentationOnly = true;

  for (const raw of changedFiles) {
    const file = cleanPath(raw);
    if (file === null) return everything(`unrecognised path: ${String(raw)}`);
    if (isInside(file, '.github')) return everything(`CI or repository tooling changed: ${file}`);
    if (isDocumentation(file)) continue;
    documentationOnly = false;
    if (isInside(file, 'tests') && TEST_FILE_PATTERN.test(file) && !registeredFiles.has(file)) {
      // An unregistered test file is excluded from CI or removed together with
      // its registry entry, and a registry edit is `all` on its own.
      continue;
    }
    if (registeredFiles.has(file)) {
      changedTests.add(file);
      continue;
    }
    if (sharedRootForRepositoryPath(inventory.sharedRoots, file) || isInside(file, 'shared')) {
      return everything(`shared runtime changed: ${file}`);
    }
    const owner = moduleForRepositoryPath(inventory.modules, file);
    if (owner) {
      changedOwners.add(owner.id);
      continue;
    }
    const legacy = legacyAreas.find(area => area.paths.some(areaPath => isInside(file, areaPath)));
    if (legacy) {
      changedOwners.add(legacy.owner);
      continue;
    }
    return everything(`not attributable to a module: ${file}`);
  }

  if (documentationOnly) {
    const reason = changedFiles.length === 0 ? 'no files changed' : 'only documentation changed';
    return { mode: 'none', reason, files: emptySelection(), affectedModules: [] };
  }

  // Each changed owner is checked on its own: a change that selects no test at
  // all is a gap in the catalog, and the safe answer to a gap is `all`.
  const affected = new Set();
  const selected = new Set(changedTests);
  for (const owner of changedOwners) {
    const closure = owner.startsWith('legacy:')
      ? new Set([owner])
      : closeOverDependents([owner], inventory.modules);
    const ownerTests = [...closure].flatMap(id => [...(testsByOwner.get(id) ?? [])]);
    if (ownerTests.length === 0) {
      return everything(`no registered test is attributed to ${owner} or its dependents`);
    }
    for (const id of closure) affected.add(id);
    for (const test of ownerTests) selected.add(test);
  }
  if (selected.size === 0) {
    return { mode: 'none', reason: 'no registered test is affected', files: emptySelection(), affectedModules: [] };
  }

  const files = emptySelection();
  for (const suite of registry.suites) {
    files[suite.id] = suite.files.filter(file => selected.has(file));
  }
  return {
    mode: 'subset',
    reason: `${affected.size} affected module(s), ${changedTests.size} changed test file(s)`,
    files,
    affectedModules: sortedUnique([...affected]),
  };
}
