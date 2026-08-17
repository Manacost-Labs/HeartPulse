#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  analyzeModuleBoundaries,
  formatModuleBoundaryReport,
} from './check-module-boundaries.mjs';
import {
  moduleForRepositoryPath,
  pathBelongsToModule,
  readModuleInventory,
  repositoryRoot,
  resolveModuleOrPathSelector,
  stableModuleExceptions,
} from './lib/module-inventory.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REASON_ORDER = new Map([
  ['selected', 0],
  ['imports-target', 1],
  ['depends-on-affected-module', 2],
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function compareReasons(left, right) {
  return (REASON_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (REASON_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER)
    || compareText(left, right);
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

function selectedGraphPaths(selection, modules, edges) {
  if (selection.kind === 'file') return new Set([selection.path]);
  const module = selection.kind === 'module'
    ? modules.find(candidate => candidate.id === selection.moduleId)
    : null;
  if (selection.kind === 'module' && !module) {
    throw new Error(`Selected module is absent from the inventory: ${selection.moduleId}`);
  }
  const paths = new Set(module ? [module.publicEntry] : [selection.path]);
  if (module?.publicStyleEntry) paths.add(module.publicStyleEntry);
  for (const edge of edges) {
    const isSelected = candidate => module
      ? pathBelongsToModule(candidate, module)
      : candidate === selection.path || candidate.startsWith(`${selection.path}/`);
    if (isSelected(edge.source)) paths.add(edge.source);
    if (isSelected(edge.target)) paths.add(edge.target);
  }
  return paths;
}

function reverseCallers(selection, modules, edges) {
  const selectedPaths = selectedGraphPaths(selection, modules, edges);
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

function affectedModuleReasons(selection, modules, transitiveCallers) {
  const reasons = new Map();
  const addReason = (moduleId, reason) => {
    if (!moduleId) return;
    if (!reasons.has(moduleId)) reasons.set(moduleId, new Set());
    reasons.get(moduleId).add(reason);
  };
  addReason(selection.moduleId, 'selected');
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

function compareDebt(left, right) {
  return compareText(left.moduleId, right.moduleId)
    || compareText(left.category, right.category)
    || compareText(left.source ?? '', right.source ?? '')
    || compareText(left.target ?? '', right.target ?? '')
    || compareText(left.reason ?? '', right.reason ?? '');
}

export function createAgentImpact({ inventory, graph, selection }) {
  const modules = [...inventory.modules].sort((left, right) => compareText(left.id, right.id));
  const { directCallers, transitiveCallers } = reverseCallers(selection, modules, graph.edges);
  const reasons = affectedModuleReasons(selection, modules, transitiveCallers);
  const affectedModules = modules
    .filter(module => reasons.has(module.id))
    .map(module => ({
      id: module.id,
      runtime: module.runtime,
      root: module.root,
      owner: module.owner,
      reasons: [...reasons.get(module.id)].sort(compareReasons),
    }));
  const affectedIds = new Set(affectedModules.map(module => module.id));
  const affectedInventoryModules = modules.filter(module => affectedIds.has(module.id));
  const focusedTests = sortedUnique(affectedInventoryModules.flatMap(module => module.focusedTests));
  const docs = sortedUnique(affectedInventoryModules.flatMap(module => module.docs));
  const contracts = sortedUnique(affectedInventoryModules.flatMap(module => [
    module.publicEntry,
    ...(module.publicStyleEntry ? [module.publicStyleEntry] : []),
  ]));
  const knownDebt = affectedInventoryModules
    .flatMap(module => stableModuleExceptions(inventory, module)
      .map(exception => ({ moduleId: module.id, ...exception })))
    .sort(compareDebt);

  return {
    schemaVersion: 1,
    command: 'impact',
    ok: true,
    target: {
      selector: selection.selector,
      kind: selection.kind,
      path: selection.path,
      moduleId: selection.moduleId,
    },
    counts: {
      directCallers: directCallers.length,
      transitiveCallers: transitiveCallers.length,
      affectedModules: affectedModules.length,
      focusedTests: focusedTests.length,
      docs: docs.length,
      knownDebt: knownDebt.length,
    },
    directCallers,
    transitiveCallers,
    affectedModules,
    contracts,
    focusedTests,
    docs,
    knownDebt,
    routeImpact: {
      status: 'not-inferred',
      reason: 'Public route ownership is tracked separately and is not inferred from code modules.',
    },
  };
}

export function loadAgentImpact({ repositoryRoot: root, selector }) {
  const resolvedRoot = realpathSync(path.resolve(root));
  const inventory = readModuleInventory(resolvedRoot);
  const graph = analyzeModuleBoundaries({ rootDir: resolvedRoot });
  if (!graph.ok) {
    throw new Error(`Module graph is invalid; refusing to infer impact.\n${formatModuleBoundaryReport(graph)}`);
  }
  const selection = resolveModuleOrPathSelector(inventory, selector, resolvedRoot);
  return createAgentImpact({ inventory, graph, selection });
}

function linesFor(label, values) {
  return [
    `${label}:`,
    ...(values.length > 0 ? values.map(value => `  - ${value}`) : ['  - (none)']),
  ];
}

export function formatAgentImpact(impact) {
  return [
    `Impact target: ${impact.target.path}`,
    `Selection kind: ${impact.target.kind}`,
    `Owning module: ${impact.target.moduleId ?? '(none)'}`,
    ...linesFor('Direct callers', impact.directCallers.map(caller => (
      `${caller.path}${caller.moduleId ? ` [${caller.moduleId}]` : ''} (${caller.kinds.join(', ')})`
    ))),
    ...linesFor('Transitive callers', impact.transitiveCallers.map(caller => (
      `${caller.path}${caller.moduleId ? ` [${caller.moduleId}]` : ''} (distance ${caller.distance})`
    ))),
    ...linesFor('Affected modules', impact.affectedModules.map(module => (
      `${module.id} [${module.owner}] — ${module.reasons.join(', ')}`
    ))),
    ...linesFor('Contracts to preserve', impact.contracts),
    ...linesFor('Focused tests', impact.focusedTests),
    ...linesFor('Documentation', impact.docs),
    ...linesFor('Known debt', impact.knownDebt.map(debt => (
      `${debt.moduleId}: ${debt.category} — ${debt.reason}`
    ))),
    'Route impact: not inferred (use agent:map for canonical route ownership)',
  ].join('\n');
}

export function formatAgentImpactJson(impact) {
  return `${JSON.stringify(impact, null, 2)}\n`;
}

export function parseAgentImpactArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    if (args.length !== 1) return { error: true };
    return { help: true };
  }
  const json = args.includes('--json');
  const selectors = args.filter(argument => argument !== '--json');
  if (selectors.length !== 1
    || args.length > 2
    || args.filter(argument => argument === '--json').length > 1
    || args.some(argument => argument.startsWith('-') && argument !== '--json')) {
    return { error: true };
  }
  return { json, selector: selectors[0] };
}

export function main(args = process.argv.slice(2), cwd = process.cwd()) {
  const parsed = parseAgentImpactArgs(args);
  const usage = 'Usage: node scripts/agent-impact.mjs <module-id-or-path> [--json]\n';
  if (parsed.error) {
    process.stderr.write(usage);
    return 2;
  }
  if (parsed.help) {
    process.stdout.write(usage);
    return 0;
  }
  const impact = loadAgentImpact({
    repositoryRoot: repositoryRoot(cwd),
    selector: parsed.selector,
  });
  process.stdout.write(parsed.json
    ? formatAgentImpactJson(impact)
    : `${formatAgentImpact(impact)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`[agent-impact] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
