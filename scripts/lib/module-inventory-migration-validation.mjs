import { isSafeMetadataText } from './diagnostic-text-policy.mjs';
import {
  CANONICAL_MODULE_ROOTS,
  CANONICAL_SHARED_ROOTS,
} from './module-boundary-contracts.mjs';
import { migrationRootForRepositoryPath } from './module-inventory.mjs';
import {
  addInventoryError,
  isInventoryRecord,
  validateFocusedTests,
} from './module-inventory-validation-policy.mjs';
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

function migrationAreaOverlap(left, right) {
  if (!isInventoryRecord(left) || !isInventoryRecord(right)
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

export function validateMigrationAreas(config, rootDir, modules, packageJson, errors) {
  const areas = Array.isArray(config.migrationAreas) ? config.migrationAreas : [];
  if (!Array.isArray(config.migrationAreas)) {
    addInventoryError(errors, 'invalid-migration-areas', 'schemaVersion 3 requires a migrationAreas array');
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
    if (!isInventoryRecord(area)) {
      addInventoryError(errors, 'invalid-migration-area', 'every migration area must be an object');
      continue;
    }
    for (const field of ['id', 'runtime', 'purpose', 'owner']) {
      if (!isSafeMetadataText(area[field])) {
        addInventoryError(
          errors,
          'invalid-migration-area',
          `migration area ${area.id || '<unknown>'} requires ${field}`,
        );
      }
    }
    if (!/^(?:client|server|shared)\.[a-z][A-Za-z0-9]*$/.test(area.id ?? '')) {
      addInventoryError(errors, 'invalid-migration-area-id', `migration area has invalid id ${area.id}`);
    }
    if (ids.has(area.id)) {
      addInventoryError(errors, 'duplicate-migration-area-id', `duplicate migration area id ${area.id}`);
    }
    if (moduleIds.has(area.id)) {
      addInventoryError(
        errors,
        'duplicate-ownership-id',
        `migration area id must not collide with a module id: ${area.id}`,
      );
    }
    ids.add(area.id);
    if (!['client', 'server', 'shared'].includes(area.runtime)) {
      addInventoryError(
        errors,
        'invalid-migration-runtime-root',
        `migration area ${area.id} has invalid runtime ${area.runtime}`,
      );
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
        addInventoryError(
          errors,
          field === 'knownDebt' ? 'invalid-migration-debt' : 'invalid-migration-area',
          `migration area ${area.id} requires a ${requiresItems ? 'non-empty ' : ''}unique ${field} array`,
        );
      }
    }
    const roots = Array.isArray(area.roots) ? area.roots : [];
    const excludeRoots = Array.isArray(area.excludeRoots) ? area.excludeRoots : [];
    for (const root of roots) {
      if (!isSafeRelativePath(root) || !repositoryEntryKind(rootDir, root)) {
        addInventoryError(
          errors,
          'unsafe-migration-root',
          `migration area ${area.id} has unsafe or missing root ${root}`,
        );
        continue;
      }
      if (expectedMigrationRuntime(root) !== area.runtime) {
        addInventoryError(
          errors,
          'invalid-migration-runtime-root',
          `migration area ${area.id} runtime does not match ${root}`,
        );
      }
      for (const protectedRoot of protectedRoots) {
        const includesProtected = isInside(protectedRoot, root);
        const insideProtected = isInside(root, protectedRoot);
        const protectedIsExcluded = excludeRoots.some(excludeRoot => (
          excludeRoot === protectedRoot || isInside(protectedRoot, excludeRoot)
        ));
        if ((insideProtected || includesProtected) && !protectedIsExcluded) {
          addInventoryError(
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
          addInventoryError(
            errors,
            'invalid-migration-root',
            `migration area ${area.id} has nested roots`,
          );
        }
      }
    }
    for (const excludeRoot of excludeRoots) {
      const isStrictChild = roots.some(root => excludeRoot !== root && isInside(excludeRoot, root));
      if (!isSafeRelativePath(excludeRoot)
        || !repositoryEntryKind(rootDir, excludeRoot)
        || !isStrictChild) {
        addInventoryError(
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
        addInventoryError(
          errors,
          'invalid-migration-target',
          `migration area ${area.id} has invalid target module ${targetModuleId}`,
        );
      }
    }
    const focusedTests = Array.isArray(area.focusedTests) ? area.focusedTests : [];
    validateFocusedTests(`migration area ${area.id}`, focusedTests, packageJson, errors);
    for (const artifact of Array.isArray(area.docs) ? area.docs : []) {
      if (!isSafeRelativePath(artifact) || repositoryEntryKind(rootDir, artifact) !== 'file') {
        addInventoryError(
          errors,
          'missing-migration-artifact',
          `migration area ${area.id} documentation is missing: ${artifact}`,
        );
      }
    }
    for (const safeStart of Array.isArray(area.safeStarts) ? area.safeStarts : []) {
      const ownerRoot = migrationRootForRepositoryPath(safeStart, area);
      if (!isSafeRelativePath(safeStart)
        || repositoryEntryKind(rootDir, safeStart) !== 'file'
        || !ownerRoot
        || !repositoryPathProjectsWithin(rootDir, safeStart, ownerRoot)
        || excludeRoots.some(root => repositoryPathProjectsWithin(rootDir, safeStart, root))) {
        addInventoryError(
          errors,
          'missing-migration-artifact',
          `migration area ${area.id} safe start is invalid: ${safeStart}`,
        );
      }
    }
    try {
      if (area.routeScope?.mode === 'none') {
        publicRoutesForScope(area.routeScope, { routes: [] });
      } else {
        publicRoutesForScope(area.routeScope, routeInventory());
      }
    } catch (error) {
      addInventoryError(
        errors,
        'invalid-migration-route-scope',
        `migration area ${area.id}: ${error.message}`,
      );
    }
  }

  for (let index = 0; index < areas.length; index += 1) {
    for (let other = index + 1; other < areas.length; other += 1) {
      const overlap = migrationAreaOverlap(areas[index], areas[other]);
      if (!overlap) continue;
      addInventoryError(
        errors,
        'overlapping-migration-areas',
        `migration areas ${areas[index]?.id || '<unknown>'} and ${areas[other]?.id || '<unknown>'} have overlapping effective roots at ${overlap.intersectionRoot}`,
        overlap,
      );
    }
  }
  return areas.filter(isInventoryRecord);
}
