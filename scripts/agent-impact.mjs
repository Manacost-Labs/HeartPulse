#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  analyzeModuleBoundaries,
  formatModuleBoundaryReport,
} from './check-module-boundaries.mjs';
import { singleLineErrorMessage } from './lib/diagnostic-text-policy.mjs';
import { compareText, sortedUnique, affectedModuleReasons, reverseCallers } from './lib/module-impact.mjs';
import {
  readModuleInventory,
  resolveModuleOrPathSelector,
  stableModuleExceptions,
} from './lib/module-inventory.mjs';
import { repositoryRoot } from './lib/repository-path-policy.mjs';
import {
  publicRoutesForScope,
  readPublicRouteInventory,
} from './lib/public-route-inventory.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REASON_ORDER = new Map([
  ['selected', 0],
  ['shared-runtime', 1],
  ['migration-target', 2],
  ['imports-target', 3],
  ['depends-on-affected-module', 4],
]);

function compareReasons(left, right) {
  return (REASON_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (REASON_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER)
    || compareText(left, right);
}

function compareDebt(left, right) {
  return compareText(left.moduleId ?? '', right.moduleId ?? '')
    || compareText(left.migrationAreaId ?? '', right.migrationAreaId ?? '')
    || compareText(left.category, right.category)
    || compareText(left.source ?? '', right.source ?? '')
    || compareText(left.target ?? '', right.target ?? '')
    || compareText(left.reason ?? '', right.reason ?? '');
}

export function createAgentImpact({ inventory, graph, selection, publicRouteInventory = null }) {
  const modules = [...inventory.modules].sort((left, right) => compareText(left.id, right.id));
  const migrationAreas = [...(inventory.migrationAreas ?? [])]
    .sort((left, right) => compareText(left.id, right.id));
  const sharedRoots = [...(inventory.sharedRoots ?? [])]
    .sort((left, right) => compareText(left.id, right.id));
  const { directCallers, transitiveCallers } = reverseCallers(
    selection,
    modules,
    migrationAreas,
    graph.edges,
  );
  const reasons = affectedModuleReasons(selection, modules, migrationAreas, transitiveCallers);
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
  const selectedMigrationAreas = selection.kind === 'root'
    ? migrationAreas
    : selection.sharedRuntime
      ? migrationAreas.filter(area => area.runtime === selection.sharedRuntime)
      : migrationAreas.filter(area => area.id === selection.migrationAreaId);
  const selectedSharedRoots = selection.kind === 'root'
    ? sharedRoots
    : sharedRoots.filter(sharedRoot => (
        sharedRoot.id === selection.sharedRootId
          || (!selection.sharedRootId && sharedRoot.root === selection.sharedRoot)
      ));
  const focusedTests = sortedUnique([
    ...affectedInventoryModules.flatMap(module => module.focusedTests),
    ...selectedMigrationAreas.flatMap(area => area.focusedTests),
    ...selectedSharedRoots.flatMap(sharedRoot => sharedRoot.focusedTests),
  ]);
  const docs = sortedUnique([
    ...affectedInventoryModules.flatMap(module => module.docs),
    ...selectedMigrationAreas.flatMap(area => area.docs),
    ...selectedSharedRoots.flatMap(sharedRoot => sharedRoot.docs),
  ]);
  const contracts = sortedUnique(affectedInventoryModules.flatMap(module => [
    module.publicEntry,
    ...(module.publicStyleEntry ? [module.publicStyleEntry] : []),
  ]));
  const knownDebt = affectedInventoryModules
    .flatMap(module => stableModuleExceptions(inventory, module)
      .map(exception => ({ moduleId: module.id, ...exception })))
    .concat(selectedMigrationAreas.flatMap(area => area.knownDebt.map(reason => ({
      migrationAreaId: area.id,
      category: 'migration-area',
      reason,
      owner: area.owner,
    }))))
    .sort(compareDebt);
  let routeImpact = {
    status: 'not-inferred',
    reason: 'Public route ownership is tracked separately and is not inferred from code modules.',
  };
  if (publicRouteInventory && selection.kind === 'root') {
    routeImpact = {
      status: 'mapped',
      routes: publicRoutesForScope({ mode: 'all' }, publicRouteInventory),
    };
  } else if (publicRouteInventory && selection.sharedRuntime) {
    routeImpact = {
      status: 'mapped',
      routes: publicRoutesForScope({ mode: 'all' }, publicRouteInventory),
    };
  } else if (publicRouteInventory && selectedMigrationAreas.length === 1) {
    routeImpact = {
      status: 'mapped',
      routes: publicRoutesForScope(selectedMigrationAreas[0].routeScope, publicRouteInventory),
    };
  }

  return {
    schemaVersion: 1,
    command: 'impact',
    ok: true,
    target: {
      selector: selection.selector,
      kind: selection.kind,
      path: selection.path,
      moduleId: selection.moduleId,
      ...(Object.hasOwn(selection, 'migrationAreaId')
        ? { migrationAreaId: selection.migrationAreaId }
        : {}),
      ...(selection.sharedRoot
        ? {
            ...(selection.sharedRootId ? { sharedRootId: selection.sharedRootId } : {}),
            sharedRoot: selection.sharedRoot,
            sharedRuntime: selection.sharedRuntime,
          }
        : {}),
    },
    counts: {
      directCallers: directCallers.length,
      transitiveCallers: transitiveCallers.length,
      affectedModules: affectedModules.length,
      focusedTests: focusedTests.length,
      docs: docs.length,
      knownDebt: knownDebt.length,
      publicRoutes: routeImpact.status === 'mapped' ? routeImpact.routes.length : 0,
    },
    directCallers,
    transitiveCallers,
    affectedModules,
    contracts,
    focusedTests,
    docs,
    knownDebt,
    routeImpact,
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
  return createAgentImpact({
    inventory,
    graph,
    selection,
    publicRouteInventory: readPublicRouteInventory(resolvedRoot),
  });
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
    `Migration area: ${impact.target.migrationAreaId ?? '(none)'}`,
    `Shared root: ${impact.target.sharedRootId ?? '(none)'}${impact.target.sharedRoot ? ` — ${impact.target.sharedRoot}` : ''}`,
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
      `${debt.moduleId ?? debt.migrationAreaId ?? debt.sharedRootId}: ${debt.category} — ${debt.reason}`
    ))),
    ...(impact.routeImpact.status === 'mapped'
      ? linesFor('Public routes', impact.routeImpact.routes.map(route => (
          `${route.pattern} (${route.id}) [${route.owner}]`
        )))
      : ['Route impact: not inferred (use agent:map for canonical route ownership)']),
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
  const usage = 'Usage: node scripts/agent-impact.mjs <module-id-or-path-or-root> [--json]\n';
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
    process.stderr.write(`[agent-impact] ${singleLineErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
