import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import { isSafeMetadataText } from './diagnostic-text-policy.mjs';
import { CANONICAL_MODULE_ROOTS } from './module-boundary-contracts.mjs';
import {
  addInventoryError,
  isInventoryRecord,
  readPackageJsonForValidation,
  validateFocusedTests,
} from './module-inventory-validation-policy.mjs';
import {
  isInside,
  isSafeRelativePath,
  repositoryEntryKind,
} from './repository-path-policy.mjs';

export function discoverModuleRoots(rootDir) {
  const roots = [];
  for (const moduleRoot of CANONICAL_MODULE_ROOTS) {
    const absoluteRoot = join(rootDir, moduleRoot);
    if (!existsSync(absoluteRoot)) continue;
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(`${moduleRoot}/${entry.name}`);
    }
  }
  return roots.sort();
}

function expectedModuleIdentity(root) {
  if (typeof root !== 'string') return null;
  if (isInside(root, 'src/modules')) return { runtime: 'client', id: `client.${basename(root)}` };
  if (isInside(root, 'server/modules')) return { runtime: 'server', id: `server.${basename(root)}` };
  return null;
}

function isUsableModule(module) {
  return isInventoryRecord(module)
    && ['id', 'runtime', 'root', 'publicEntry'].every(field => (
      typeof module[field] === 'string' && module[field].length > 0
    ))
    && Array.isArray(module.dependencies);
}

export function validateModules(config, rootDir, discoveredRoots, errors) {
  if (JSON.stringify(config.moduleRoots) !== JSON.stringify(CANONICAL_MODULE_ROOTS)) {
    addInventoryError(
      errors,
      'invalid-boundary-roots',
      'moduleRoots and sharedRoots must match the canonical client/server architecture roots',
    );
  }
  const modules = Array.isArray(config.modules) ? config.modules : [];
  const packageJson = readPackageJsonForValidation(rootDir, errors);
  const configuredRoots = modules
    .filter(isInventoryRecord)
    .map(module => module.root)
    .filter(root => typeof root === 'string')
    .sort();
  if (JSON.stringify(configuredRoots) !== JSON.stringify(discoveredRoots)) {
    addInventoryError(
      errors,
      'module-inventory-mismatch',
      'configured modules must exactly match module directories',
      { configured: configuredRoots, discovered: discoveredRoots },
    );
  }

  const ids = new Set();
  const roots = new Set();
  for (const module of modules) {
    if (!isInventoryRecord(module)) {
      addInventoryError(errors, 'invalid-module', 'every module inventory item must be an object');
      continue;
    }
    for (const field of ['id', 'runtime', 'root', 'purpose', 'owner', 'publicEntry']) {
      if (!isSafeMetadataText(module[field])) {
        addInventoryError(errors, 'invalid-module', `module ${module.id || '<unknown>'} requires ${field}`);
      }
    }
    if (!['client', 'server'].includes(module.runtime)) {
      addInventoryError(errors, 'invalid-module-runtime', `module ${module.id} has invalid runtime ${module.runtime}`);
    }
    const expectedIdentity = expectedModuleIdentity(module.root);
    if (!expectedIdentity || module.runtime !== expectedIdentity.runtime) {
      addInventoryError(
        errors,
        'invalid-module-runtime-root',
        `module ${module.id} runtime must match its canonical module root`,
      );
    }
    if (!expectedIdentity || module.id !== expectedIdentity.id) {
      addInventoryError(
        errors,
        'invalid-module-id',
        `module id must be derived from its canonical root: ${expectedIdentity?.id || '<invalid-root>'}`,
      );
    }
    if (ids.has(module.id)) {
      addInventoryError(errors, 'duplicate-module-id', `duplicate module id ${module.id}`);
    }
    if (roots.has(module.root)) {
      addInventoryError(errors, 'duplicate-module-root', `duplicate module root ${module.root}`);
    }
    ids.add(module.id);
    roots.add(module.root);

    const expectedPublicEntry = `${module.root}/public.ts`;
    if (module.publicEntry !== expectedPublicEntry) {
      addInventoryError(errors, 'invalid-public-entry', `module ${module.id} publicEntry must be ${expectedPublicEntry}`);
    } else {
      const absolutePublicEntry = join(rootDir, expectedPublicEntry);
      if (existsSync(absolutePublicEntry)
        && repositoryEntryKind(rootDir, expectedPublicEntry) !== 'file') {
        addInventoryError(
          errors,
          'invalid-public-entry',
          `module ${module.id} publicEntry must be a regular repository file`,
        );
      }
    }
    if (module.publicStyleEntry !== undefined) {
      const expectedPublicStyleEntry = `${module.root}/public.css`;
      if (module.runtime !== 'client' || module.publicStyleEntry !== expectedPublicStyleEntry) {
        addInventoryError(
          errors,
          'invalid-public-style-entry',
          `client module ${module.id} publicStyleEntry must be ${expectedPublicStyleEntry}`,
        );
      } else if (repositoryEntryKind(rootDir, expectedPublicStyleEntry) !== 'file') {
        addInventoryError(
          errors,
          'invalid-public-style-entry',
          `module ${module.id} publicStyleEntry must be a regular file`,
        );
      }
    }

    const dependencies = Array.isArray(module.dependencies) ? module.dependencies : [];
    const focusedTests = Array.isArray(module.focusedTests) ? module.focusedTests : [];
    const docs = Array.isArray(module.docs) ? module.docs : [];
    if (!Array.isArray(module.dependencies)
      || !Array.isArray(module.focusedTests)
      || !Array.isArray(module.docs)
      || focusedTests.length === 0
      || docs.length === 0
      || [...dependencies, ...focusedTests, ...docs].some(value => !isSafeMetadataText(value))) {
      addInventoryError(
        errors,
        'invalid-module-ownership',
        `module ${module.id} requires dependencies, focusedTests and docs arrays`,
      );
    }
    validateFocusedTests(`module ${module.id}`, focusedTests, packageJson, errors);
    for (const artifact of docs) {
      if (!isSafeRelativePath(artifact) || repositoryEntryKind(rootDir, artifact) !== 'file') {
        addInventoryError(
          errors,
          'missing-module-artifact',
          `module ${module.id} ownership artifact is missing: ${artifact}`,
        );
      }
    }
  }

  for (const module of modules) {
    if (!isInventoryRecord(module) || !Array.isArray(module.dependencies)) continue;
    for (const dependency of module.dependencies) {
      const target = modules.find(candidate => (
        isInventoryRecord(candidate) && candidate.id === dependency
      ));
      if (!target || target.id === module.id) {
        addInventoryError(
          errors,
          'invalid-module-dependency',
          `module ${module.id} has invalid dependency ${dependency}`,
        );
      } else if (target.runtime !== module.runtime) {
        addInventoryError(
          errors,
          'invalid-module-dependency',
          `module ${module.id} cannot declare cross-runtime dependency ${dependency}`,
        );
      }
    }
  }

  return {
    modules: modules.filter(isUsableModule),
    packageJson,
  };
}
