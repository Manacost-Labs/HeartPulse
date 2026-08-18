import { resolve } from 'node:path';

import { validateExceptionMetadata } from './module-boundary-exceptions.mjs';
import { validateMigrationAreas } from './module-inventory-migration-validation.mjs';
import {
  discoverModuleRoots,
  validateModules,
} from './module-inventory-module-validation.mjs';
import { validateSharedRoots } from './module-inventory-shared-root-validation.mjs';
import {
  addInventoryError,
  isInventoryRecord,
} from './module-inventory-validation-policy.mjs';

function validateConfig(config, rootDir, discoveredRoots, errors) {
  if (config.schemaVersion !== 3) {
    addInventoryError(
      errors,
      'invalid-schema-version',
      'module-boundaries schemaVersion must be 3',
    );
  }
  const { modules, packageJson } = validateModules(
    config,
    rootDir,
    discoveredRoots,
    errors,
  );
  const migrationAreas = validateMigrationAreas(
    config,
    rootDir,
    modules,
    packageJson,
    errors,
  );
  const sharedRoots = validateSharedRoots(
    config,
    rootDir,
    modules,
    migrationAreas,
    packageJson,
    errors,
  );
  return { modules, migrationAreas, sharedRoots };
}

export function validateModuleInventoryMetadata({
  rootDir = process.cwd(),
  config,
  now = new Date(),
} = {}) {
  const absoluteRoot = resolve(rootDir);
  const errors = [];
  if (!isInventoryRecord(config)) {
    addInventoryError(
      errors,
      'invalid-config-shape',
      'module-boundaries inventory must contain an object',
    );
    return {
      ok: false,
      modules: [],
      migrationAreas: [],
      sharedRoots: [],
      errors,
    };
  }
  const discoveredRoots = discoverModuleRoots(absoluteRoot);
  const inventory = validateConfig(config, absoluteRoot, discoveredRoots, errors);
  validateExceptionMetadata(config, errors, now);
  return {
    ok: errors.length === 0,
    ...inventory,
    errors,
  };
}
