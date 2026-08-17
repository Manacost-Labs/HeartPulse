#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  analyzeModuleBoundaries,
  formatModuleBoundaryReport,
} from './check-module-boundaries.mjs';
import {
  moduleForRepositoryPath,
  readModuleInventory,
  relevantModuleExceptions,
  repositoryRoot,
  resolveRepositoryFile,
} from './lib/module-inventory.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PUBLIC_ROUTE_INVENTORY_PATH = 'src/shared/seo/publicRouteInventory.json';

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function readPublicRouteInventory(root) {
  const inventoryFile = resolveRepositoryFile(root, PUBLIC_ROUTE_INVENTORY_PATH, { required: true });
  let inventory;
  try {
    inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'));
  } catch (error) {
    throw new Error(
      `Public route inventory is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!inventory || typeof inventory !== 'object'
    || inventory.schemaVersion !== 1
    || typeof inventory.canonicalOrigin !== 'string'
    || !Array.isArray(inventory.routes)) {
    throw new Error('Public route inventory must use schemaVersion 1 and declare canonicalOrigin and routes.');
  }
  const routeIds = new Set();
  for (const route of inventory.routes) {
    if (!route || typeof route !== 'object'
      || ['id', 'pattern', 'kind', 'owner', 'indexPolicy'].some(field => (
        typeof route[field] !== 'string' || !route[field].trim()
      ))) {
      throw new Error('Every public route requires id, pattern, kind, owner and indexPolicy.');
    }
    if (routeIds.has(route.id)) throw new Error(`Duplicate public route id: ${route.id}`);
    routeIds.add(route.id);
  }
  return inventory;
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
    exceptions: relevantModuleExceptions(inventory, module),
  }));
  const publicRoutes = publicRouteInventory.routes
    .map(route => ({
      id: route.id,
      pattern: route.pattern,
      kind: route.kind,
      owner: route.owner,
      indexPolicy: route.indexPolicy,
    }))
    .sort((left, right) => compareText(left.pattern, right.pattern) || compareText(left.id, right.id));

  return {
    schemaVersion: 1,
    command: 'map',
    ok: true,
    sources: {
      modules: 'config/module-boundaries.json',
      publicRoutes: PUBLIC_ROUTE_INVENTORY_PATH,
    },
    canonicalOrigin: publicRouteInventory.canonicalOrigin,
    counts: {
      modules: mappedModules.length,
      clientModules: mappedModules.filter(module => module.runtime === 'client').length,
      serverModules: mappedModules.filter(module => module.runtime === 'server').length,
      publicRoutes: publicRoutes.length,
      sources: graph.counts.sources,
      edges: graph.counts.edges,
      runtimeCycles: graph.counts.runtimeCycle,
    },
    modules: mappedModules,
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
    `  ${listLine('dependencies', module.dependencies)}`,
    `  ${listLine('dependents', module.dependents)}`,
    '  callers:',
    ...callers,
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
    process.stderr.write(`[agent-map] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
