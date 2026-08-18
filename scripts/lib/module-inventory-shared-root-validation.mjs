import { isSafeMetadataText } from './diagnostic-text-policy.mjs';
import { CANONICAL_SHARED_ROOTS } from './module-boundary-contracts.mjs';
import {
  addInventoryError,
  isInventoryRecord,
  validateFocusedTests,
} from './module-inventory-validation-policy.mjs';
import {
  isInside,
  isSafeRelativePath,
  repositoryEntryKind,
  repositoryPathProjectsWithin,
} from './repository-path-policy.mjs';

function isUsableSharedRoot(sharedRoot) {
  return isInventoryRecord(sharedRoot)
    && ['id', 'runtime', 'root', 'purpose', 'owner'].every(field => (
      isSafeMetadataText(sharedRoot[field])
    ))
    && Array.isArray(sharedRoot.focusedTests)
    && Array.isArray(sharedRoot.docs)
    && Array.isArray(sharedRoot.safeStarts);
}

export function validateSharedRoots(
  config,
  rootDir,
  modules,
  migrationAreas,
  packageJson,
  errors,
) {
  const sharedRoots = Array.isArray(config.sharedRoots) ? config.sharedRoots : [];
  const configuredIdentities = sharedRoots
    .filter(isInventoryRecord)
    .map(({ id, runtime, root }) => ({ id, runtime, root }))
    .sort((left, right) => String(left.root).localeCompare(String(right.root)));
  const canonicalIdentities = [...CANONICAL_SHARED_ROOTS]
    .sort((left, right) => left.root.localeCompare(right.root));
  if (JSON.stringify(configuredIdentities) !== JSON.stringify(canonicalIdentities)) {
    addInventoryError(
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
    if (!isInventoryRecord(sharedRoot)) {
      addInventoryError(
        errors,
        'invalid-shared-root',
        'every shared root inventory item must be an object',
      );
      continue;
    }
    for (const field of ['id', 'runtime', 'root', 'purpose', 'owner']) {
      if (!isSafeMetadataText(sharedRoot[field])) {
        addInventoryError(
          errors,
          'invalid-shared-root',
          `shared root ${sharedRoot.id || '<unknown>'} requires ${field}`,
        );
      }
    }
    if (!['client', 'server'].includes(sharedRoot.runtime)) {
      addInventoryError(
        errors,
        'invalid-shared-root-runtime',
        `shared root ${sharedRoot.id || '<unknown>'} has invalid runtime ${sharedRoot.runtime}`,
      );
    }
    if (architectureIds.has(sharedRoot.id)) {
      addInventoryError(
        errors,
        'duplicate-ownership-id',
        `shared root id must not collide with another ownership id: ${sharedRoot.id}`,
      );
    }
    architectureIds.add(sharedRoot.id);
    if (roots.has(sharedRoot.root)) {
      addInventoryError(errors, 'duplicate-shared-root', `duplicate shared root ${sharedRoot.root}`);
    }
    roots.add(sharedRoot.root);
    if (!isSafeRelativePath(sharedRoot.root)
      || repositoryEntryKind(rootDir, sharedRoot.root) !== 'directory') {
      addInventoryError(
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
      addInventoryError(
        errors,
        'invalid-shared-root-ownership',
        `shared root ${sharedRoot.id || '<unknown>'} requires non-empty focusedTests, docs and safeStarts arrays`,
      );
    }
    for (const [field, values] of Object.entries({ focusedTests, docs, safeStarts })) {
      if (new Set(values).size !== values.length) {
        addInventoryError(
          errors,
          'invalid-shared-root-ownership',
          `shared root ${sharedRoot.id || '<unknown>'} has duplicate ${field} entries`,
        );
      }
    }
    validateFocusedTests(`shared root ${sharedRoot.id}`, focusedTests, packageJson, errors);
    for (const artifact of docs) {
      if (!isSafeRelativePath(artifact) || repositoryEntryKind(rootDir, artifact) !== 'file') {
        addInventoryError(
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
        addInventoryError(
          errors,
          'missing-shared-root-artifact',
          `shared root ${sharedRoot.id} safe start is invalid: ${safeStart}`,
        );
      }
    }
  }
  return sharedRoots.filter(isUsableSharedRoot);
}
