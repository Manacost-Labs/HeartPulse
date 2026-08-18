import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { singleLineErrorMessage } from './diagnostic-text-policy.mjs';
import { MODULE_EXCEPTION_GROUPS } from './module-boundary-contracts.mjs';
import {
  normalizeRepositoryPath,
  resolveRepositoryFile,
  resolveRepositoryPath,
} from './repository-path-policy.mjs';

export const MODULE_INVENTORY_PATH = 'config/module-boundaries.json';

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
      `Module inventory is not valid JSON: ${singleLineErrorMessage(error)}`,
    );
  }
  if (!inventory || typeof inventory !== 'object'
    || inventory.schemaVersion !== 3
    || !Array.isArray(inventory.modules)
    || !Array.isArray(inventory.migrationAreas)
    || !Array.isArray(inventory.sharedRoots)) {
    throw new Error(
      'Module inventory must use schemaVersion 3 and contain modules, migrationAreas and sharedRoots arrays.',
    );
  }
  return inventory;
}

export function pathBelongsToModule(candidate, module) {
  if (typeof candidate !== 'string') return false;
  return candidate === module.id
    || candidate === module.root
    || candidate.startsWith(`${module.root}/`);
}

export function moduleForRepositoryPath(modules, candidate, root = '') {
  const normalizedCandidate = normalizeRepositoryPath(candidate, root);
  return [...modules]
    .filter(module => pathBelongsToModule(normalizedCandidate, {
      ...module,
      root: normalizeRepositoryPath(module.root, root),
    }))
    .sort((left, right) => right.root.length - left.root.length)[0] ?? null;
}

export function sharedRootForRepositoryPath(sharedRoots, candidate, root = '') {
  const normalizedCandidate = normalizeRepositoryPath(candidate, root);
  return [...(Array.isArray(sharedRoots) ? sharedRoots : [])]
    .map(entry => ({ ...entry, root: normalizeRepositoryPath(entry.root, root) }))
    .filter(entry => (
      normalizedCandidate === entry.root
      || normalizedCandidate.startsWith(`${entry.root}/`)
    ))
    .sort((left, right) => right.root.length - left.root.length)[0] ?? null;
}

export function pathBelongsToMigrationArea(candidate, area, root = '') {
  if (typeof candidate !== 'string' || !area || typeof area !== 'object') return false;
  const normalizedCandidate = normalizeRepositoryPath(candidate, root);
  const roots = Array.isArray(area.roots)
    ? area.roots.map(areaRoot => normalizeRepositoryPath(areaRoot, root)).filter(Boolean)
    : [];
  const excludeRoots = Array.isArray(area.excludeRoots)
    ? area.excludeRoots.map(areaRoot => normalizeRepositoryPath(areaRoot, root)).filter(Boolean)
    : [];
  return roots.some(areaRoot => (
    (normalizedCandidate === areaRoot || normalizedCandidate.startsWith(`${areaRoot}/`))
      && !excludeRoots.some(excludeRoot => (
        normalizedCandidate === excludeRoot || normalizedCandidate.startsWith(`${excludeRoot}/`)
      ))
  ));
}

export function migrationAreasForRepositoryPath(areas, candidate, root = '') {
  return [...(Array.isArray(areas) ? areas : [])]
    .filter(area => pathBelongsToMigrationArea(candidate, area, root))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function isProductSourcePath(candidate) {
  return ['src', 'server', 'shared'].some(sourceRoot => (
    candidate === sourceRoot || candidate.startsWith(`${sourceRoot}/`)
  ));
}

export function resolveModuleOrPathSelector(inventory, selector, root) {
  const rawSelector = String(selector || '').trim();
  if (!rawSelector) throw new Error('Module or path selector must not be empty.');
  if (rawSelector === 'root' || rawSelector === '.') {
    return {
      selector: rawSelector,
      kind: 'root',
      path: '.',
      moduleId: null,
      migrationAreaId: null,
    };
  }
  const selectedModule = inventory.modules.find(module => module.id === rawSelector) ?? null;
  const selectedArea = (inventory.migrationAreas ?? [])
    .find(area => area.id === rawSelector) ?? null;
  if (!Array.isArray(inventory.sharedRoots)) {
    throw new Error('Module inventory sharedRoots must be an array.');
  }
  const selectedSharedRoot = inventory.sharedRoots
    .find(sharedRoot => sharedRoot.id === rawSelector) ?? null;
  const selectedOwners = [selectedModule, selectedArea, selectedSharedRoot].filter(Boolean);
  if (selectedOwners.length > 1) {
    throw new Error(`Selector is ambiguous between architecture owners: ${rawSelector}`);
  }
  const selectedAreaRoot = selectedArea?.roots?.[0];
  if (selectedArea && (typeof selectedAreaRoot !== 'string' || !selectedAreaRoot)) {
    throw new Error(`Migration area ${rawSelector} does not declare a usable root.`);
  }
  const candidatePath = selectedModule?.root
    ?? selectedAreaRoot
    ?? selectedSharedRoot?.root
    ?? rawSelector;
  const normalizedPath = resolveRepositoryPath(root, candidatePath);
  const owningModule = selectedModule
    ?? moduleForRepositoryPath(inventory.modules, normalizedPath, root);
  const owningSharedRoot = selectedSharedRoot ?? sharedRootForRepositoryPath(
    inventory.sharedRoots,
    normalizedPath,
    root,
  );
  const matchingAreas = migrationAreasForRepositoryPath(
    inventory.migrationAreas,
    normalizedPath,
    root,
  );
  if (matchingAreas.length > 1) {
    throw new Error(
      `Repository path belongs to multiple migration areas: ${normalizedPath} (${matchingAreas.map(area => area.id).join(', ')})`,
    );
  }
  const owningArea = selectedArea ?? matchingAreas[0] ?? null;
  if (owningModule && owningArea) {
    throw new Error(
      `Repository path belongs to both module ${owningModule.id} and migration area ${owningArea.id}: ${normalizedPath}`,
    );
  }
  if ((owningModule || owningArea) && owningSharedRoot) {
    throw new Error(
      `Repository path belongs to both product and shared ownership: ${normalizedPath}`,
    );
  }
  if (!owningModule && !owningArea && !owningSharedRoot
    && isProductSourcePath(normalizedPath)) {
    throw new Error(
      `Product source path is not owned by a module or migration area: ${normalizedPath}`,
    );
  }
  const normalizedModuleRoot = owningModule
    ? normalizeRepositoryPath(owningModule.root, root)
    : null;
  const normalizedAreaRoots = owningArea
    ? owningArea.roots.map(areaRoot => normalizeRepositoryPath(areaRoot, root))
    : [];
  const pathStats = lstatSync(path.resolve(root, normalizedPath));
  const selection = {
    selector: rawSelector,
    kind: normalizedModuleRoot === normalizedPath
      ? 'module'
      : normalizedAreaRoots.includes(normalizedPath)
        ? 'migration-area'
        : owningSharedRoot?.root === normalizedPath
          ? 'shared-root'
          : pathStats.isDirectory() ? 'directory' : 'file',
    path: normalizedPath,
    moduleId: owningModule?.id ?? null,
  };
  if (owningArea) selection.migrationAreaId = owningArea.id;
  if (owningSharedRoot) {
    selection.sharedRootId = owningSharedRoot.id;
    selection.sharedRoot = owningSharedRoot.root;
    selection.sharedRuntime = owningSharedRoot.runtime;
  }
  return selection;
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

function stableExceptionEdge(edge) {
  return {
    source: edge.source,
    target: edge.target,
    kind: edge.kind,
  };
}

function stableException(exception) {
  const stable = { category: exception.category };
  for (const field of ['source', 'target', 'kind', 'module']) {
    if (exception[field] !== undefined) stable[field] = exception[field];
  }
  if (Array.isArray(exception.nodes)) {
    stable.nodes = [...exception.nodes].sort((left, right) => (
      left < right ? -1 : left > right ? 1 : 0
    ));
  }
  if (Array.isArray(exception.edges)) {
    stable.edges = exception.edges
      .map(stableExceptionEdge)
      .sort((left, right) => (
        (left.source < right.source ? -1 : left.source > right.source ? 1 : 0)
        || (left.target < right.target ? -1 : left.target > right.target ? 1 : 0)
        || (left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0)
      ));
  }
  for (const field of ['reason', 'owner', 'expiresOn']) {
    if (exception[field] !== undefined) stable[field] = exception[field];
  }
  return stable;
}

export function stableModuleExceptions(inventory, module) {
  return relevantModuleExceptions(inventory, module)
    .map(stableException)
    .sort((left, right) => {
      const leftKey = JSON.stringify(left);
      const rightKey = JSON.stringify(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
}
