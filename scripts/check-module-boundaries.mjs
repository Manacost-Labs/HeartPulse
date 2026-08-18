import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  singleLineDisplay,
  singleLineErrorMessage,
} from './lib/diagnostic-text-policy.mjs';
import { pathBelongsToMigrationArea } from './lib/module-inventory.mjs';
import {
  validateModuleInventoryMetadata,
} from './lib/module-inventory-validation.mjs';
import { CANONICAL_SHARED_ROOTS } from './lib/module-boundary-contracts.mjs';
import { validateExceptionGraph } from './lib/module-boundary-exceptions.mjs';
import {
  compareEdges,
  edgeKey,
} from './lib/module-boundary-edges.mjs';
import { describeCycles } from './lib/module-boundary-graph.mjs';
import {
  isInside,
  projectPath,
  repositoryEntryKind,
} from './lib/repository-path-policy.mjs';
import { formatModuleBoundaryReport } from './lib/module-boundary-report.mjs';
import {
  walkOwnershipFiles,
  walkSourceFiles,
} from './lib/module-boundary-source-scan.mjs';
import {
  buildEdges,
  readCompilerOptions,
} from './lib/module-import-graph.mjs';

export {
  formatModuleBoundaryReport,
  validateModuleInventoryMetadata,
};

function moduleForPath(modules, path) {
  return modules
    .filter(module => isInside(path, module.root))
    .sort((left, right) => right.root.length - left.root.length)[0] || null;
}

function isPublicModuleEntry(module, path) {
  return path === module.publicEntry
    || (typeof module.publicStyleEntry === 'string' && path === module.publicStyleEntry);
}

function sharedRuntimeForPath(sharedRoots, path) {
  for (const sharedRoot of Array.isArray(sharedRoots) ? sharedRoots : []) {
    if (typeof sharedRoot?.root === 'string' && isInside(path, sharedRoot.root)) {
      return sharedRoot.runtime;
    }
  }
  return null;
}

function pathBelongsToSharedRuntime(sharedRoots, runtime, path) {
  return (Array.isArray(sharedRoots) ? sharedRoots : []).some(sharedRoot => (
    sharedRoot?.runtime === runtime
      && typeof sharedRoot.root === 'string'
      && isInside(path, sharedRoot.root)
  ));
}

function projectRuntimeForPath(path) {
  if (isInside(path, 'src')) return 'client';
  if (isInside(path, 'server')) return 'server';
  return null;
}

function addError(errors, code, message, details = {}) {
  errors.push({ code, message, ...details });
}

function validateMigrationCoverage(areas, modules, ownershipFiles, errors) {
  const legacyFiles = ownershipFiles.filter(path => (
    !moduleForPath(modules, path)
    && !sharedRuntimeForPath(CANONICAL_SHARED_ROOTS, path)
  ));
  let orphaned = 0;
  let overlapping = 0;
  for (const source of legacyFiles) {
    const matches = areas.filter(area => pathBelongsToMigrationArea(source, area));
    if (matches.length === 0) {
      orphaned += 1;
      addError(errors, 'orphaned-migration-source', `product source has no migration owner: ${source}`, { source });
    } else if (matches.length > 1) {
      overlapping += 1;
      addError(
        errors,
        'overlapping-migration-source',
        `product source has multiple migration owners: ${source}`,
        { source, migrationAreas: matches.map(area => area.id).sort() },
      );
    }
  }
  return { orphaned, overlapping };
}

function validateDeclaredDependencies(modules, edges, errors) {
  const actualDependencies = new Map(modules.map(module => [module.id, new Set()]));
  for (const edge of edges) {
    const sourceModule = moduleForPath(modules, edge.source);
    const targetModule = moduleForPath(modules, edge.target);
    if (sourceModule && targetModule && sourceModule.id !== targetModule.id) {
      actualDependencies.get(sourceModule.id)?.add(targetModule.id);
    }
  }
  for (const module of modules) {
    for (const dependency of module.dependencies) {
      if (!actualDependencies.get(module.id)?.has(dependency)) {
        addError(
          errors,
          'stale-module-dependency',
          `${module.id} declares unused dependency ${dependency}`,
          { source: module.id, target: dependency },
        );
      }
    }
  }
}

export function analyzeModuleBoundaries({
  rootDir = process.cwd(),
  configPath = 'config/module-boundaries.json',
  now = new Date(),
} = {}) {
  const absoluteRoot = resolve(rootDir);
  const absoluteConfig = resolve(absoluteRoot, configPath);
  const errors = [];
  let config;
  try {
    config = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      counts: { modules: 0, migrationAreas: 0, sources: 0, ownershipSources: 0, edges: 0, orphanedMigrationSource: 0, overlappingMigrationSource: 0, missingPublicEntry: 0, internalImport: 0, moduleLegacyImport: 0, runtimeCrossing: 0, typeCycle: 0, runtimeCycle: 0 },
      violations: { missingPublicEntry: [], internalImport: [], moduleLegacyImport: [], runtimeCrossing: [], typeCycle: [] },
      cycles: { runtime: [], typeInclusive: [] },
      edges: [],
      errors: [{ code: 'invalid-config', message: singleLineErrorMessage(error) }],
    };
  }

  const sharedRoots = CANONICAL_SHARED_ROOTS;
  const configuredModules = Array.isArray(config?.modules) ? config.modules : [];
  const metadata = validateModuleInventoryMetadata({ rootDir: absoluteRoot, config, now });
  errors.push(...metadata.errors);
  const migrationAreas = metadata.migrationAreas;
  const modules = metadata.modules;

  const sourceScan = walkSourceFiles(absoluteRoot);
  errors.push(...sourceScan.errors);
  const absoluteSourceFiles = sourceScan.files;
  const sourceFiles = absoluteSourceFiles.map(path => projectPath(absoluteRoot, path));
  const ownershipScan = walkOwnershipFiles(absoluteRoot);
  errors.push(...ownershipScan.errors);
  const migrationCoverage = validateMigrationCoverage(
    migrationAreas,
    modules,
    ownershipScan.files,
    errors,
  );
  const compilerConfig = readCompilerOptions(absoluteRoot);
  errors.push(...compilerConfig.errors);
  const graph = buildEdges(absoluteRoot, absoluteSourceFiles, compilerConfig.options);
  errors.push(...graph.errors);
  const edges = graph.edges;
  validateDeclaredDependencies(modules, edges, errors);

  const violations = {
    missingPublicEntry: [],
    internalImport: [],
    moduleLegacyImport: [],
    runtimeCrossing: [],
    typeCycle: [],
  };

  for (const module of modules) {
    const expectedPublicEntry = `${module.root}/public.ts`;
    if (repositoryEntryKind(absoluteRoot, expectedPublicEntry) !== 'file') {
      violations.missingPublicEntry.push({
        source: module.root,
        target: expectedPublicEntry,
        kind: 'missing-public-entry',
        module: module.id,
      });
    }
  }

  for (const edge of edges) {
    const sourceModule = moduleForPath(modules, edge.source);
    const targetModule = moduleForPath(modules, edge.target);
    const sourceSharedRuntime = sharedRuntimeForPath(sharedRoots, edge.source);
    const sourceRuntime = projectRuntimeForPath(edge.source);
    const targetRuntime = projectRuntimeForPath(edge.target);

    if (sourceRuntime && targetRuntime && sourceRuntime !== targetRuntime) {
      violations.runtimeCrossing.push(edge);
    }

    if (targetModule && sourceModule?.id !== targetModule.id && !isPublicModuleEntry(targetModule, edge.target)) {
      violations.internalImport.push(edge);
    }

    if (sourceModule && targetModule && sourceModule.id !== targetModule.id) {
      if (sourceModule.runtime !== targetModule.runtime) {
        addError(errors, 'cross-runtime-import', `${sourceModule.id} imports ${targetModule.id} across runtimes`, { edge });
      }
      if (!(sourceModule.dependencies || []).includes(targetModule.id)) {
        addError(errors, 'undeclared-module-dependency', `${sourceModule.id} must declare dependency on ${targetModule.id}`, { edge });
      }
    }

    if (sourceModule && !targetModule) {
      const allowedShared = pathBelongsToSharedRuntime(sharedRoots, sourceModule.runtime, edge.target);
      if (!allowedShared) violations.moduleLegacyImport.push(edge);
    }

    if (sourceSharedRuntime) {
      const allowedShared = pathBelongsToSharedRuntime(sharedRoots, sourceSharedRuntime, edge.target);
      if (!allowedShared) {
        addError(errors, 'shared-back-dependency', `${edge.source} imports outside ${sourceSharedRuntime} shared roots`, { edge });
      }
    }
  }

  violations.internalImport = [...new Map(violations.internalImport.map(edge => [edgeKey(edge), edge])).values()].sort(compareEdges);
  violations.moduleLegacyImport = [...new Map(violations.moduleLegacyImport.map(edge => [edgeKey(edge), edge])).values()].sort(compareEdges);
  violations.runtimeCrossing = [...new Map(violations.runtimeCrossing.map(edge => [edgeKey(edge), edge])).values()].sort(compareEdges);
  violations.missingPublicEntry.sort(compareEdges);

  const cycles = describeCycles(sourceFiles, edges);
  violations.typeCycle = cycles.typeInclusive;
  for (const cycle of cycles.runtime) {
    addError(errors, 'runtime-cycle', `runtime import cycle: ${cycle.nodes.join(' -> ')}`, { cycle });
  }

  validateExceptionGraph(config, violations, errors);

  return {
    ok: errors.length === 0,
    counts: {
      modules: configuredModules.length,
      migrationAreas: migrationAreas.length,
      sources: sourceFiles.length,
      ownershipSources: ownershipScan.files.length,
      edges: edges.length,
      orphanedMigrationSource: migrationCoverage.orphaned,
      overlappingMigrationSource: migrationCoverage.overlapping,
      missingPublicEntry: violations.missingPublicEntry.length,
      internalImport: violations.internalImport.length,
      moduleLegacyImport: violations.moduleLegacyImport.length,
      runtimeCrossing: violations.runtimeCrossing.length,
      typeCycle: cycles.typeInclusive.length,
      runtimeCycle: cycles.runtime.length,
    },
    violations,
    cycles,
    edges,
    errors,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  const args = process.argv.slice(2);
  let rootDir = process.cwd();
  let configPath = 'config/module-boundaries.json';
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--root') rootDir = args[++index];
    else if (args[index] === '--config') configPath = args[++index];
    else {
      console.error(`Unknown argument: ${singleLineDisplay(args[index])}`);
      process.exit(2);
    }
  }
  const report = analyzeModuleBoundaries({ rootDir, configPath });
  console.log(formatModuleBoundaryReport(report));
  if (!report.ok) process.exit(1);
}
