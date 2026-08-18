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
  readModuleInventory,
  repositoryRoot,
  singleLineErrorMessage,
  stableModuleExceptions,
} from './lib/module-inventory.mjs';
import {
  PUBLIC_ROUTE_INVENTORY_PATH,
  publicRoutesForScope,
  readPublicRouteInventory,
} from './lib/public-route-inventory.mjs';

export { readPublicRouteInventory } from './lib/public-route-inventory.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function moduleCallers(module, modules, edges) {
  const publicTargets = new Set([
    module.publicEntry,
    ...(module.publicStyleEntry ? [module.publicStyleEntry] : []),
  ]);
  const callers = new Map();
  for (const edge of edges) {
    if (!publicTargets.has(edge.target)) continue;
    const callerModule = moduleForRepositoryPath(modules, edge.source);
    if (callerModule?.id === module.id) continue;
    callers.set(edge.source, {
      path: edge.source,
      moduleId: callerModule?.id ?? null,
    });
  }
  return [...callers.values()].sort((left, right) => compareText(left.path, right.path));
}

export function createAgentMap({ inventory, graph, publicRouteInventory }) {
  const modules = [...inventory.modules].sort((left, right) => compareText(left.id, right.id));
  const dependents = new Map(modules.map(module => [module.id, []]));
  for (const module of modules) {
    for (const dependency of module.dependencies) {
      dependents.get(dependency)?.push(module.id);
    }
  }

  const mappedModules = modules.map(module => ({
    id: module.id,
    runtime: module.runtime,
    root: module.root,
    purpose: module.purpose,
    owner: module.owner,
    publicEntry: module.publicEntry,
    publicStyleEntry: module.publicStyleEntry ?? null,
    dependencies: sortedUnique(module.dependencies),
    dependents: sortedUnique(dependents.get(module.id) ?? []),
    callers: moduleCallers(module, modules, graph.edges),
    focusedTests: sortedUnique(module.focusedTests),
    docs: sortedUnique(module.docs),
    exceptions: stableModuleExceptions(inventory, module),
  }));
  const migrationAreas = [...(inventory.migrationAreas ?? [])]
    .sort((left, right) => compareText(left.id, right.id))
    .map(area => ({
      id: area.id,
      runtime: area.runtime,
      roots: sortedUnique(area.roots),
      excludeRoots: sortedUnique(area.excludeRoots),
      purpose: area.purpose,
      owner: area.owner,
      targetModules: sortedUnique(area.targetModules),
      focusedTests: sortedUnique(area.focusedTests),
      docs: sortedUnique(area.docs),
      safeStarts: sortedUnique(area.safeStarts),
      publicRoutes: publicRoutesForScope(area.routeScope, publicRouteInventory),
      knownDebt: sortedUnique(area.knownDebt),
    }));
  const sharedRoots = [...(inventory.sharedRoots ?? [])]
    .sort((left, right) => compareText(left.root, right.root))
    .map(sharedRoot => ({
      id: sharedRoot.id,
      runtime: sharedRoot.runtime,
      root: sharedRoot.root,
      purpose: sharedRoot.purpose,
      owner: sharedRoot.owner,
      focusedTests: sortedUnique(sharedRoot.focusedTests),
      docs: sortedUnique(sharedRoot.docs),
      safeStarts: sortedUnique(sharedRoot.safeStarts),
    }));
  const publicRoutes = publicRoutesForScope({ mode: 'all' }, publicRouteInventory);

  return {
    schemaVersion: 1,
    command: 'map',
    ok: true,
    sources: {
      modules: 'config/module-boundaries.json',
      migrationAreas: 'config/module-boundaries.json',
      sharedRoots: 'config/module-boundaries.json',
      publicRoutes: PUBLIC_ROUTE_INVENTORY_PATH,
    },
    canonicalOrigin: publicRouteInventory.canonicalOrigin,
    counts: {
      modules: mappedModules.length,
      migrationAreas: migrationAreas.length,
      sharedRoots: sharedRoots.length,
      clientModules: mappedModules.filter(module => module.runtime === 'client').length,
      serverModules: mappedModules.filter(module => module.runtime === 'server').length,
      publicRoutes: publicRoutes.length,
      sources: graph.counts.sources,
      edges: graph.counts.edges,
      runtimeCycles: graph.counts.runtimeCycle,
    },
    modules: mappedModules,
    migrationAreas,
    sharedRoots,
    publicRoutes,
  };
}

export function loadAgentMap({ repositoryRoot: root }) {
  const resolvedRoot = realpathSync(path.resolve(root));
  const inventory = readModuleInventory(resolvedRoot);
  const graph = analyzeModuleBoundaries({ rootDir: resolvedRoot });
  if (!graph.ok) {
    throw new Error(`Module graph is invalid; refusing to emit a partial map.\n${formatModuleBoundaryReport(graph)}`);
  }
  return createAgentMap({
    inventory,
    graph,
    publicRouteInventory: readPublicRouteInventory(resolvedRoot),
  });
}

function listLine(label, values) {
  return `${label}: ${values.length > 0 ? values.join(', ') : '(none)'}`;
}

function formatModule(module) {
  const callers = module.callers.length > 0
    ? module.callers.map(caller => `    - ${caller.path}${caller.moduleId ? ` [${caller.moduleId}]` : ''}`)
    : ['    - (none)'];
  return [
    `- ${module.id} [${module.owner}]`,
    `  ${module.purpose}`,
    `  root: ${module.root}`,
    `  public: ${module.publicEntry}`,
    ...(module.publicStyleEntry ? [`  public style: ${module.publicStyleEntry}`] : []),
    `  ${listLine('dependencies', module.dependencies)}`,
    `  ${listLine('dependents', module.dependents)}`,
    `  ${listLine('focused tests', module.focusedTests)}`,
    `  ${listLine('docs', module.docs)}`,
    `  ${listLine('known debt', module.exceptions.map(exception => (
      `[${exception.category}] ${exception.source ?? exception.module ?? '?'} -> ${exception.target ?? '?'} — ${exception.reason}`
    )))}`,
    '  callers:',
    ...callers,
  ];
}

function formatMigrationArea(area) {
  return [
    `- ${area.id} [${area.owner}]`,
    `  ${area.purpose}`,
    `  roots: ${area.roots.join(', ')}`,
    `  ${listLine('excluded roots', area.excludeRoots)}`,
    `  ${listLine('targets', area.targetModules)}`,
    `  ${listLine('safe starts', area.safeStarts)}`,
    `  ${listLine('focused tests', area.focusedTests)}`,
    `  ${listLine('docs', area.docs)}`,
    `  ${listLine('routes', area.publicRoutes.map(route => `${route.pattern} (${route.id})`))}`,
    `  ${listLine('known debt', area.knownDebt)}`,
  ];
}

function formatSharedRoot(sharedRoot) {
  return [
    `- ${sharedRoot.id} [${sharedRoot.owner}]`,
    `  ${sharedRoot.purpose}`,
    `  root: ${sharedRoot.root} [${sharedRoot.runtime}]`,
    `  ${listLine('safe starts', sharedRoot.safeStarts)}`,
    `  ${listLine('focused tests', sharedRoot.focusedTests)}`,
    `  ${listLine('docs', sharedRoot.docs)}`,
  ];
}

export function formatAgentMap(map) {
  const clientModules = map.modules.filter(module => module.runtime === 'client');
  const serverModules = map.modules.filter(module => module.runtime === 'server');
  const moduleLines = modules => (
    modules.length > 0 ? modules.flatMap(formatModule) : ['- (none)']
  );
  return [
    `Project map: ${map.counts.modules} modules (${map.counts.clientModules} client, ${map.counts.serverModules} server), ${map.counts.publicRoutes} public routes`,
    `Import graph: ${map.counts.sources} sources, ${map.counts.edges} edges, ${map.counts.runtimeCycles} runtime cycles`,
    '',
    'Client modules:',
    ...moduleLines(clientModules),
    '',
    'Server modules:',
    ...moduleLines(serverModules),
    '',
    'Canonical shared roots:',
    ...(map.sharedRoots.length > 0
      ? map.sharedRoots.flatMap(formatSharedRoot)
      : ['- (none)']),
    '',
    'Migration areas:',
    ...(map.migrationAreas.length > 0
      ? map.migrationAreas.flatMap(formatMigrationArea)
      : ['- (none)']),
    '',
    `Public URL ownership (${map.canonicalOrigin}):`,
    ...map.publicRoutes.map(route => (
      `- ${route.pattern} (${route.id}) [${route.owner}] — ${route.kind}, ${route.indexPolicy}`
    )),
  ].join('\n');
}

export function formatAgentMapJson(map) {
  return `${JSON.stringify(map, null, 2)}\n`;
}

export function main(args = process.argv.slice(2), cwd = process.cwd()) {
  if (args.length > 1 || args.some(argument => !['--json', '--help', '-h'].includes(argument))) {
    process.stderr.write('Usage: node scripts/agent-map.mjs [--json]\n');
    return 2;
  }
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('Usage: node scripts/agent-map.mjs [--json]\n');
    return 0;
  }
  const map = loadAgentMap({ repositoryRoot: repositoryRoot(cwd) });
  process.stdout.write(args.includes('--json')
    ? formatAgentMapJson(map)
    : `${formatAgentMap(map)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`[agent-map] ${singleLineErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
