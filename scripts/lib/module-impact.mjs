/**
 * Which modules a change reaches: the module itself, the modules that import
 * it (reverse callers in the import graph), modules of the same shared
 * runtime, migration targets, and everything that declares a dependency on any
 * of those. Shared by `scripts/agent-impact.mjs` and the pull request test
 * selection (`scripts/lib/ci-affected-tests.mjs`), so both answer the same.
 */
import {
  moduleForRepositoryPath,
  pathBelongsToMigrationArea,
  pathBelongsToModule,
} from './module-inventory.mjs';

export function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function callerDetails(paths, edgeKinds, modules, distances = null) {
  return [...paths]
    .sort(compareText)
    .map(callerPath => ({
      path: callerPath,
      moduleId: moduleForRepositoryPath(modules, callerPath)?.id ?? null,
      ...(distances ? { distance: distances.get(callerPath) } : {}),
      kinds: sortedUnique(edgeKinds.get(callerPath) ?? []),
    }));
}

function selectedGraphPaths(selection, modules, migrationAreas, edges) {
  if (selection.kind === 'file') return new Set([selection.path]);
  if (selection.kind === 'root') {
    return new Set(edges.flatMap(edge => [edge.source, edge.target]));
  }
  const module = selection.kind === 'module'
    ? modules.find(candidate => candidate.id === selection.moduleId)
    : null;
  if (selection.kind === 'module' && !module) {
    throw new Error(`Selected module is absent from the inventory: ${selection.moduleId}`);
  }
  const migrationArea = selection.kind === 'migration-area'
    ? migrationAreas.find(candidate => candidate.id === selection.migrationAreaId)
    : null;
  if (selection.kind === 'migration-area' && !migrationArea) {
    throw new Error(`Selected migration area is absent from the inventory: ${selection.migrationAreaId}`);
  }
  const paths = new Set(module ? [module.publicEntry] : migrationArea ? [] : [selection.path]);
  if (module?.publicStyleEntry) paths.add(module.publicStyleEntry);
  for (const edge of edges) {
    const isSelected = candidate => module
      ? pathBelongsToModule(candidate, module)
      : migrationArea
        ? pathBelongsToMigrationArea(candidate, migrationArea)
        : candidate === selection.path || candidate.startsWith(`${selection.path}/`);
    if (isSelected(edge.source)) paths.add(edge.source);
    if (isSelected(edge.target)) paths.add(edge.target);
  }
  return paths;
}

export function reverseCallers(selection, modules, migrationAreas, edges) {
  const selectedPaths = selectedGraphPaths(selection, modules, migrationAreas, edges);
  const incoming = new Map();
  for (const edge of edges) {
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target).push(edge);
  }
  for (const targetEdges of incoming.values()) {
    targetEdges.sort((left, right) => (
      compareText(left.source, right.source)
      || compareText(left.kind, right.kind)
      || compareText(left.target, right.target)
    ));
  }

  const directPaths = new Set();
  const directKinds = new Map();
  for (const target of [...selectedPaths].sort(compareText)) {
    for (const edge of incoming.get(target) ?? []) {
      if (selectedPaths.has(edge.source)) continue;
      directPaths.add(edge.source);
      if (!directKinds.has(edge.source)) directKinds.set(edge.source, new Set());
      directKinds.get(edge.source).add(edge.kind);
    }
  }

  const distances = new Map([...selectedPaths].map(selectedPath => [selectedPath, 0]));
  const transitiveKinds = new Map();
  const queue = [...selectedPaths].sort(compareText);
  for (let index = 0; index < queue.length; index += 1) {
    const target = queue[index];
    const nextDistance = distances.get(target) + 1;
    for (const edge of incoming.get(target) ?? []) {
      if (selectedPaths.has(edge.source)) continue;
      if (!transitiveKinds.has(edge.source)) transitiveKinds.set(edge.source, new Set());
      transitiveKinds.get(edge.source).add(edge.kind);
      const previousDistance = distances.get(edge.source);
      if (previousDistance === undefined || nextDistance < previousDistance) {
        distances.set(edge.source, nextDistance);
        queue.push(edge.source);
      }
    }
  }

  const transitivePaths = new Set(
    [...distances.entries()]
      .filter(([candidate, distance]) => distance > 0 && !selectedPaths.has(candidate))
      .map(([candidate]) => candidate),
  );
  return {
    directCallers: callerDetails(directPaths, directKinds, modules),
    transitiveCallers: callerDetails(transitivePaths, transitiveKinds, modules, distances),
  };
}

export function affectedModuleReasons(selection, modules, migrationAreas, transitiveCallers) {
  const reasons = new Map();
  const addReason = (moduleId, reason) => {
    if (!moduleId) return;
    if (!reasons.has(moduleId)) reasons.set(moduleId, new Set());
    reasons.get(moduleId).add(reason);
  };
  if (selection.kind === 'root') {
    for (const module of modules) addReason(module.id, 'selected');
  } else {
    addReason(selection.moduleId, 'selected');
  }
  if (selection.sharedRuntime) {
    for (const module of modules) {
      if (module.runtime === selection.sharedRuntime) addReason(module.id, 'shared-runtime');
    }
  }
  const selectedArea = migrationAreas
    .find(area => area.id === selection.migrationAreaId);
  for (const moduleId of selectedArea?.targetModules ?? []) {
    addReason(moduleId, 'migration-target');
  }
  for (const caller of transitiveCallers) addReason(caller.moduleId, 'imports-target');

  let added = true;
  while (added) {
    added = false;
    for (const module of modules) {
      if (reasons.has(module.id)) continue;
      if (module.dependencies.some(dependency => reasons.has(dependency))) {
        addReason(module.id, 'depends-on-affected-module');
        added = true;
      }
    }
  }
  return reasons;
}

