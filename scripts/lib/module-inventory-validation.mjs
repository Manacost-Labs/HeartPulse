import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { isSafeMetadataText } from './diagnostic-text-policy.mjs';
import {
  CANONICAL_MODULE_ROOTS,
  CANONICAL_SHARED_ROOTS,
} from './module-boundary-contracts.mjs';
import { validateExceptionMetadata } from './module-boundary-exceptions.mjs';
import { migrationRootForRepositoryPath } from './module-inventory.mjs';
import {
  focusedTestScriptId,
  packageScriptExists,
  packageScriptLifecycleHooks,
} from './npm-script-policy.mjs';
import {
  publicRoutesForScope,
  readPublicRouteInventory,
} from './public-route-inventory.mjs';
import {
  isInside,
  isSafeRelativePath,
  repositoryEntryKind,
  repositoryPathProjectsWithin,
} from './repository-path-policy.mjs';

function discoverModuleRoots(rootDir, moduleRoots) {
  const roots = [];
  for (const moduleRoot of moduleRoots) {
    const absoluteRoot = join(rootDir, moduleRoot);
    if (!existsSync(absoluteRoot)) continue;
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(`${moduleRoot}/${entry.name}`);
    }
  }
  return roots.sort();
}

function addError(errors, code, message, details = {}) {
  errors.push({ code, message, ...details });
}

function validateFocusedTests(ownerLabel, commands, packageJson, errors) {
  for (const command of commands) {
    const script = focusedTestScriptId(command);
    if (!script) {
      addError(
        errors,
        'invalid-focused-test-command',
        `${ownerLabel} focusedTests must contain exact allowlisted npm run test:* commands`,
      );
    } else if (!packageScriptExists(packageJson, script)) {
      addError(errors, 'missing-focused-test-script', `${ownerLabel} references missing package script ${script}`);
    } else {
      const hooks = packageScriptLifecycleHooks(packageJson, script);
      if (hooks.length > 0) {
        addError(
          errors,
          'focused-test-lifecycle-hook',
          `${ownerLabel} focused test ${script} must not have pre/post lifecycle hooks`,
        );
      }
    }
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function migrationAreaOverlap(left, right) {
  if (!isRecord(left) || !isRecord(right)
    || !Array.isArray(left.roots) || !Array.isArray(right.roots)
    || !Array.isArray(left.excludeRoots) || !Array.isArray(right.excludeRoots)) {
    return null;
  }
  for (const leftRoot of left.roots) {
    if (typeof leftRoot !== 'string') continue;
    for (const rightRoot of right.roots) {
      if (typeof rightRoot !== 'string') continue;
      const intersectionRoot = isInside(leftRoot, rightRoot)
        ? leftRoot
        : isInside(rightRoot, leftRoot) ? rightRoot : null;
      if (!intersectionRoot) continue;
      const leftExcludesIntersection = left.excludeRoots.some(excludeRoot => (
        typeof excludeRoot === 'string' && isInside(intersectionRoot, excludeRoot)
      ));
      const rightExcludesIntersection = right.excludeRoots.some(excludeRoot => (
        typeof excludeRoot === 'string' && isInside(intersectionRoot, excludeRoot)
      ));
      if (!leftExcludesIntersection && !rightExcludesIntersection) {
        return { leftRoot, rightRoot, intersectionRoot };
      }
    }
  }
  return null;
}

function expectedMigrationRuntime(path) {
  if (isInside(path, 'src') || isInside(path, 'public/bg-legacy')) return 'client';
  if (isInside(path, 'server')) return 'server';
  if (isInside(path, 'shared')) return 'shared';
  return null;
}

function validateMigrationAreas(config, rootDir, modules, packageJson, errors) {
  const areas = Array.isArray(config.migrationAreas) ? config.migrationAreas : [];
  if (!Array.isArray(config.migrationAreas)) {
    addError(errors, 'invalid-migration-areas', 'schemaVersion 3 requires a migrationAreas array');
  }
  const ids = new Set();
  let publicRouteInventory = null;
  const routeInventory = () => {
    if (!publicRouteInventory) publicRouteInventory = readPublicRouteInventory(rootDir);
    return publicRouteInventory;
  };
  const moduleIds = new Set(modules.map(module => module.id));
  const protectedRoots = [
    ...CANONICAL_MODULE_ROOTS,
    ...CANONICAL_SHARED_ROOTS.map(sharedRoot => sharedRoot.root),
  ];

  for (const area of areas) {
    if (!isRecord(area)) {
      addError(errors, 'invalid-migration-area', 'every migration area must be an object');
      continue;
    }
    for (const field of ['id', 'runtime', 'purpose', 'owner']) {
      if (!isSafeMetadataText(area[field])) {
        addError(errors, 'invalid-migration-area', `migration area ${area.id || '<unknown>'} requires ${field}`);
      }
    }
    if (!/^(?:client|server|shared)\.[a-z][A-Za-z0-9]*$/.test(area.id ?? '')) {
      addError(errors, 'invalid-migration-area-id', `migration area has invalid id ${area.id}`);
    }
    if (ids.has(area.id)) addError(errors, 'duplicate-migration-area-id', `duplicate migration area id ${area.id}`);
    if (moduleIds.has(area.id)) {
      addError(
        errors,
        'duplicate-ownership-id',
        `migration area id must not collide with a module id: ${area.id}`,
      );
    }
    ids.add(area.id);
    if (!['client', 'server', 'shared'].includes(area.runtime)) {
      addError(errors, 'invalid-migration-runtime-root', `migration area ${area.id} has invalid runtime ${area.runtime}`);
    }

    const arrayFields = [
      'roots',
      'excludeRoots',
      'targetModules',
      'focusedTests',
      'docs',
      'safeStarts',
      'knownDebt',
    ];
    for (const field of arrayFields) {
      const value = area[field];
      const requiresItems = ['roots', 'focusedTests', 'docs', 'safeStarts', 'knownDebt'].includes(field);
      if (!Array.isArray(value)
        || (requiresItems && value.length === 0)
        || value.some(item => !isSafeMetadataText(item))
        || new Set(value).size !== value.length) {
        addError(errors, field === 'knownDebt' ? 'invalid-migration-debt' : 'invalid-migration-area',
          `migration area ${area.id} requires a ${requiresItems ? 'non-empty ' : ''}unique ${field} array`);
      }
    }
    const roots = Array.isArray(area.roots) ? area.roots : [];
    const excludeRoots = Array.isArray(area.excludeRoots) ? area.excludeRoots : [];
    for (const root of roots) {
      if (!isSafeRelativePath(root) || !repositoryEntryKind(rootDir, root)) {
        addError(errors, 'unsafe-migration-root', `migration area ${area.id} has unsafe or missing root ${root}`);
        continue;
      }
      if (expectedMigrationRuntime(root) !== area.runtime) {
        addError(errors, 'invalid-migration-runtime-root', `migration area ${area.id} runtime does not match ${root}`);
      }
      for (const protectedRoot of protectedRoots) {
        const includesProtected = isInside(protectedRoot, root);
        const insideProtected = isInside(root, protectedRoot);
        const protectedIsExcluded = excludeRoots.some(excludeRoot => (
          excludeRoot === protectedRoot || isInside(protectedRoot, excludeRoot)
        ));
        if ((insideProtected || includesProtected) && !protectedIsExcluded) {
          addError(
            errors,
            'migration-area-overlaps-architecture-root',
            `migration area ${area.id} overlaps protected root ${protectedRoot}`,
          );
        }
      }
    }
    for (let index = 0; index < roots.length; index += 1) {
      for (let other = index + 1; other < roots.length; other += 1) {
        if (isInside(roots[index], roots[other]) || isInside(roots[other], roots[index])) {
          addError(errors, 'invalid-migration-root', `migration area ${area.id} has nested roots`);
        }
      }
    }
    for (const excludeRoot of excludeRoots) {
      const isStrictChild = roots.some(root => excludeRoot !== root && isInside(excludeRoot, root));
      if (!isSafeRelativePath(excludeRoot)
        || !repositoryEntryKind(rootDir, excludeRoot)
        || !isStrictChild) {
        addError(
          errors,
          'invalid-migration-exclusion',
          `migration area ${area.id} exclusion must be an existing strict child: ${excludeRoot}`,
        );
      }
    }

    const targetModules = Array.isArray(area.targetModules) ? area.targetModules : [];
    for (const targetModuleId of targetModules) {
      const target = modules.find(module => module.id === targetModuleId);
      if (!target || (area.runtime !== 'shared' && target.runtime !== area.runtime)) {
        addError(errors, 'invalid-migration-target', `migration area ${area.id} has invalid target module ${targetModuleId}`);
      }
    }
    const focusedTests = Array.isArray(area.focusedTests) ? area.focusedTests : [];
    validateFocusedTests(`migration area ${area.id}`, focusedTests, packageJson, errors);
    for (const artifact of Array.isArray(area.docs) ? area.docs : []) {
      if (!isSafeRelativePath(artifact) || repositoryEntryKind(rootDir, artifact) !== 'file') {
        addError(errors, 'missing-migration-artifact', `migration area ${area.id} documentation is missing: ${artifact}`);
      }
    }
    for (const safeStart of Array.isArray(area.safeStarts) ? area.safeStarts : []) {
      const ownerRoot = migrationRootForRepositoryPath(safeStart, area);
      if (!isSafeRelativePath(safeStart)
        || repositoryEntryKind(rootDir, safeStart) !== 'file'
        || !ownerRoot
        || !repositoryPathProjectsWithin(rootDir, safeStart, ownerRoot)
        || excludeRoots.some(root => repositoryPathProjectsWithin(rootDir, safeStart, root))) {
        addError(errors, 'missing-migration-artifact', `migration area ${area.id} safe start is invalid: ${safeStart}`);
      }
    }
    try {
      if (area.routeScope?.mode === 'none') publicRoutesForScope(area.routeScope, { routes: [] });
      else publicRoutesForScope(area.routeScope, routeInventory());
    } catch (error) {
      addError(errors, 'invalid-migration-route-scope', `migration area ${area.id}: ${error.message}`);
    }
  }
  for (let index = 0; index < areas.length; index += 1) {
    for (let other = index + 1; other < areas.length; other += 1) {
      const overlap = migrationAreaOverlap(areas[index], areas[other]);
      if (!overlap) continue;
      addError(
        errors,
        'overlapping-migration-areas',
        `migration areas ${areas[index]?.id || '<unknown>'} and ${areas[other]?.id || '<unknown>'} have overlapping effective roots at ${overlap.intersectionRoot}`,
        overlap,
      );
    }
  }
  return areas.filter(isRecord);
}

function readPackageJsonForValidation(rootDir, errors) {
  const packagePath = join(rootDir, 'package.json');
  if (!isRegularFile(packagePath)) {
    addError(errors, 'invalid-package-json', 'package.json must be a regular file');
    return {};
  }
  try {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    if (!isRecord(packageJson)) throw new Error('root value must be an object');
    return packageJson;
  } catch (error) {
    addError(errors, 'invalid-package-json', `package.json is invalid: ${error.message}`);
    return {};
  }
}

function expectedModuleIdentity(root) {
  if (typeof root !== 'string') return null;
  if (isInside(root, 'src/modules')) return { runtime: 'client', id: `client.${basename(root)}` };
  if (isInside(root, 'server/modules')) return { runtime: 'server', id: `server.${basename(root)}` };
  return null;
}

function isUsableModule(module) {
  return isRecord(module)
    && ['id', 'runtime', 'root', 'publicEntry'].every(field => (
      typeof module[field] === 'string' && module[field].length > 0
    ))
    && Array.isArray(module.dependencies);
}

function isUsableSharedRoot(sharedRoot) {
  return isRecord(sharedRoot)
    && ['id', 'runtime', 'root', 'purpose', 'owner'].every(field => (
      isSafeMetadataText(sharedRoot[field])
    ))
    && Array.isArray(sharedRoot.focusedTests)
    && Array.isArray(sharedRoot.docs)
    && Array.isArray(sharedRoot.safeStarts);
}

function validateSharedRoots(config, rootDir, modules, migrationAreas, packageJson, errors) {
  const sharedRoots = Array.isArray(config.sharedRoots) ? config.sharedRoots : [];
  const configuredIdentities = sharedRoots
    .filter(isRecord)
    .map(({ id, runtime, root }) => ({ id, runtime, root }))
    .sort((left, right) => String(left.root).localeCompare(String(right.root)));
  const canonicalIdentities = [...CANONICAL_SHARED_ROOTS]
    .sort((left, right) => left.root.localeCompare(right.root));
  if (JSON.stringify(configuredIdentities) !== JSON.stringify(canonicalIdentities)) {
    addError(
      errors,
      'invalid-boundary-roots',
      'moduleRoots and sharedRoots must match the canonical client/server architecture roots',
    );
  }

  const architectureIds = new Set([
    ...modules.map(module => module.id),
    ...migrationAreas.map(area => area.id),
  ]);
  const roots = new Set();
  for (const sharedRoot of sharedRoots) {
    if (!isRecord(sharedRoot)) {
      addError(errors, 'invalid-shared-root', 'every shared root inventory item must be an object');
      continue;
    }
    for (const field of ['id', 'runtime', 'root', 'purpose', 'owner']) {
      if (!isSafeMetadataText(sharedRoot[field])) {
        addError(
          errors,
          'invalid-shared-root',
          `shared root ${sharedRoot.id || '<unknown>'} requires ${field}`,
        );
      }
    }
    if (!['client', 'server'].includes(sharedRoot.runtime)) {
      addError(
        errors,
        'invalid-shared-root-runtime',
        `shared root ${sharedRoot.id || '<unknown>'} has invalid runtime ${sharedRoot.runtime}`,
      );
    }
    if (architectureIds.has(sharedRoot.id)) {
      addError(
        errors,
        'duplicate-ownership-id',
        `shared root id must not collide with another ownership id: ${sharedRoot.id}`,
      );
    }
    architectureIds.add(sharedRoot.id);
    if (roots.has(sharedRoot.root)) {
      addError(errors, 'duplicate-shared-root', `duplicate shared root ${sharedRoot.root}`);
    }
    roots.add(sharedRoot.root);
    if (!isSafeRelativePath(sharedRoot.root)
      || repositoryEntryKind(rootDir, sharedRoot.root) !== 'directory') {
      addError(
        errors,
        'missing-shared-root-artifact',
        `shared root ${sharedRoot.id || '<unknown>'} root is missing: ${sharedRoot.root}`,
      );
    }

    const focusedTests = Array.isArray(sharedRoot.focusedTests) ? sharedRoot.focusedTests : [];
    const docs = Array.isArray(sharedRoot.docs) ? sharedRoot.docs : [];
    const safeStarts = Array.isArray(sharedRoot.safeStarts) ? sharedRoot.safeStarts : [];
    if (!Array.isArray(sharedRoot.focusedTests)
      || !Array.isArray(sharedRoot.docs)
      || !Array.isArray(sharedRoot.safeStarts)
      || focusedTests.length === 0
      || docs.length === 0
      || safeStarts.length === 0
      || [...focusedTests, ...docs, ...safeStarts]
        .some(value => !isSafeMetadataText(value))) {
      addError(
        errors,
        'invalid-shared-root-ownership',
        `shared root ${sharedRoot.id || '<unknown>'} requires non-empty focusedTests, docs and safeStarts arrays`,
      );
    }
    for (const [field, values] of Object.entries({ focusedTests, docs, safeStarts })) {
      if (new Set(values).size !== values.length) {
        addError(
          errors,
          'invalid-shared-root-ownership',
          `shared root ${sharedRoot.id || '<unknown>'} has duplicate ${field} entries`,
        );
      }
    }
    validateFocusedTests(`shared root ${sharedRoot.id}`, focusedTests, packageJson, errors);
    for (const artifact of docs) {
      if (!isSafeRelativePath(artifact) || repositoryEntryKind(rootDir, artifact) !== 'file') {
        addError(
          errors,
          'missing-shared-root-artifact',
          `shared root ${sharedRoot.id} documentation is missing: ${artifact}`,
        );
      }
    }
    for (const safeStart of safeStarts) {
      if (!isSafeRelativePath(safeStart)
        || repositoryEntryKind(rootDir, safeStart) !== 'file'
        || !isInside(safeStart, sharedRoot.root)
        || !repositoryPathProjectsWithin(rootDir, safeStart, sharedRoot.root)) {
        addError(
          errors,
          'missing-shared-root-artifact',
          `shared root ${sharedRoot.id} safe start is invalid: ${safeStart}`,
        );
      }
    }
  }
  return sharedRoots.filter(isUsableSharedRoot);
}

function validateConfig(config, rootDir, discoveredRoots, errors) {
  if (config.schemaVersion !== 3) addError(errors, 'invalid-schema-version', 'module-boundaries schemaVersion must be 3');
  if (JSON.stringify(config.moduleRoots) !== JSON.stringify(CANONICAL_MODULE_ROOTS)) {
    addError(
      errors,
      'invalid-boundary-roots',
      'moduleRoots and sharedRoots must match the canonical client/server architecture roots',
    );
  }
  const modules = Array.isArray(config.modules) ? config.modules : [];
  const packageJson = readPackageJsonForValidation(rootDir, errors);
  const configuredRoots = modules
    .filter(isRecord)
    .map(module => module.root)
    .filter(root => typeof root === 'string')
    .sort();
  if (JSON.stringify(configuredRoots) !== JSON.stringify(discoveredRoots)) {
    addError(errors, 'module-inventory-mismatch', 'configured modules must exactly match module directories', {
      configured: configuredRoots,
      discovered: discoveredRoots,
    });
  }

  const ids = new Set();
  const roots = new Set();
  for (const module of modules) {
    if (!isRecord(module)) {
      addError(errors, 'invalid-module', 'every module inventory item must be an object');
      continue;
    }
    for (const field of ['id', 'runtime', 'root', 'purpose', 'owner', 'publicEntry']) {
      if (!isSafeMetadataText(module[field])) {
        addError(errors, 'invalid-module', `module ${module.id || '<unknown>'} requires ${field}`);
      }
    }
    if (!['client', 'server'].includes(module.runtime)) {
      addError(errors, 'invalid-module-runtime', `module ${module.id} has invalid runtime ${module.runtime}`);
    }
    const expectedIdentity = expectedModuleIdentity(module.root);
    if (!expectedIdentity || module.runtime !== expectedIdentity.runtime) {
      addError(
        errors,
        'invalid-module-runtime-root',
        `module ${module.id} runtime must match its canonical module root`,
      );
    }
    if (!expectedIdentity || module.id !== expectedIdentity.id) {
      addError(
        errors,
        'invalid-module-id',
        `module id must be derived from its canonical root: ${expectedIdentity?.id || '<invalid-root>'}`,
      );
    }
    if (ids.has(module.id)) addError(errors, 'duplicate-module-id', `duplicate module id ${module.id}`);
    if (roots.has(module.root)) addError(errors, 'duplicate-module-root', `duplicate module root ${module.root}`);
    ids.add(module.id);
    roots.add(module.root);
    const expectedPublicEntry = `${module.root}/public.ts`;
    if (module.publicEntry !== expectedPublicEntry) {
      addError(errors, 'invalid-public-entry', `module ${module.id} publicEntry must be ${expectedPublicEntry}`);
    } else {
      const absolutePublicEntry = join(rootDir, expectedPublicEntry);
      if (existsSync(absolutePublicEntry)
        && repositoryEntryKind(rootDir, expectedPublicEntry) !== 'file') {
        addError(errors, 'invalid-public-entry', `module ${module.id} publicEntry must be a regular repository file`);
      }
    }
    if (module.publicStyleEntry !== undefined) {
      const expectedPublicStyleEntry = `${module.root}/public.css`;
      if (module.runtime !== 'client' || module.publicStyleEntry !== expectedPublicStyleEntry) {
        addError(
          errors,
          'invalid-public-style-entry',
          `client module ${module.id} publicStyleEntry must be ${expectedPublicStyleEntry}`,
        );
      } else if (repositoryEntryKind(rootDir, expectedPublicStyleEntry) !== 'file') {
        addError(
          errors,
          'invalid-public-style-entry',
          `module ${module.id} publicStyleEntry must be a regular file`,
        );
      }
    }
    const dependencies = Array.isArray(module.dependencies) ? module.dependencies : [];
    const focusedTests = Array.isArray(module.focusedTests) ? module.focusedTests : [];
    const docs = Array.isArray(module.docs) ? module.docs : [];
    if (!Array.isArray(module.dependencies) || !Array.isArray(module.focusedTests) || !Array.isArray(module.docs)
      || focusedTests.length === 0 || docs.length === 0
      || [...dependencies, ...focusedTests, ...docs].some(value => !isSafeMetadataText(value))) {
      addError(errors, 'invalid-module-ownership', `module ${module.id} requires dependencies, focusedTests and docs arrays`);
    }
    validateFocusedTests(`module ${module.id}`, focusedTests, packageJson, errors);
    for (const artifact of docs) {
      if (!isSafeRelativePath(artifact) || repositoryEntryKind(rootDir, artifact) !== 'file') {
        addError(errors, 'missing-module-artifact', `module ${module.id} ownership artifact is missing: ${artifact}`);
      }
    }
  }

  for (const module of modules) {
    if (!isRecord(module) || !Array.isArray(module.dependencies)) continue;
    for (const dependency of module.dependencies || []) {
      const target = modules.find(candidate => isRecord(candidate) && candidate.id === dependency);
      if (!target || target.id === module.id) {
        addError(errors, 'invalid-module-dependency', `module ${module.id} has invalid dependency ${dependency}`);
      } else if (target.runtime !== module.runtime) {
        addError(errors, 'invalid-module-dependency', `module ${module.id} cannot declare cross-runtime dependency ${dependency}`);
      }
    }
  }
  const migrationAreas = validateMigrationAreas(
    config,
    rootDir,
    modules.filter(isUsableModule),
    packageJson,
    errors,
  );
  const sharedRoots = validateSharedRoots(
    config,
    rootDir,
    modules.filter(isUsableModule),
    migrationAreas,
    packageJson,
    errors,
  );
  return { migrationAreas, sharedRoots };
}

export function validateModuleInventoryMetadata({
  rootDir = process.cwd(),
  config,
  now = new Date(),
} = {}) {
  const absoluteRoot = resolve(rootDir);
  const errors = [];
  if (!isRecord(config)) {
    addError(errors, 'invalid-config-shape', 'module-boundaries inventory must contain an object');
    return {
      ok: false,
      modules: [],
      migrationAreas: [],
      sharedRoots: [],
      errors,
    };
  }
  const discoveredRoots = discoverModuleRoots(absoluteRoot, CANONICAL_MODULE_ROOTS);
  const { migrationAreas, sharedRoots } = validateConfig(
    config,
    absoluteRoot,
    discoveredRoots,
    errors,
  );
  validateExceptionMetadata(config, errors, now);
  const modules = (Array.isArray(config?.modules) ? config.modules : [])
    .filter(isUsableModule);
  return {
    ok: errors.length === 0,
    modules,
    migrationAreas,
    sharedRoots,
    errors,
  };
}
