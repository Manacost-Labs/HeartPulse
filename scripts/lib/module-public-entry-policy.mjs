import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { addInventoryError } from './module-inventory-validation-policy.mjs';
import { repositoryEntryKind } from './repository-path-policy.mjs';

/** Only explicitly declared module contracts permit imports from outside their owner. */
export function isPublicModuleEntry(module, path) {
  return path === module.publicEntry
    || (typeof module.publicIndexEntry === 'string' && path === module.publicIndexEntry)
    || (typeof module.publicStyleEntry === 'string' && path === module.publicStyleEntry);
}

/** Missing primary files stay governed by the existing exception policy; optional entries must exist. */
export function validatePublicEntries(module, rootDir, errors) {
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

  if (module.publicIndexEntry !== undefined) {
    const expected = `${module.root}/public/index.ts`;
    if (module.publicIndexEntry !== expected || repositoryEntryKind(rootDir, expected) !== 'file') {
      addInventoryError(errors, 'invalid-public-index-entry',
        `module ${module.id} publicIndexEntry must be the regular file ${expected}`);
    }
  }
}
