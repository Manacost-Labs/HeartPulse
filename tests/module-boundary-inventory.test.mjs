import assert from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import * as boundaryModule from '../scripts/check-module-boundaries.mjs';
import {
  NOW,
  baseConfig,
  cleanup,
  fixture,
  migrationAreaEntry,
  moduleEntry,
  sharedRootEntry,
  writeFixture,
} from './support/module-boundary-fixture.mjs';

const {
  analyzeModuleBoundaries,
  formatModuleBoundaryReport,
  validateModuleInventoryMetadata,
} = boundaryModule;

test('inventory must exactly match module directories and reference existing ownership artifacts', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const root = fixture(baseConfig([alpha]));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    writeFixture(root, 'src/modules/unregistered/public.ts', 'export {};\n');
    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(report.errors.some(error => error.code === 'module-inventory-mismatch'));

    rmSync(join(root, 'docs/modules.md'));
    const missingDocs = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(missingDocs.errors.some(error => error.code === 'missing-module-artifact'));
  } finally {
    cleanup(root);
  }
});

test('schema v3 requires every product source to have exactly one checked migration owner', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const area = migrationAreaEntry(
    'client.legacyAlpha',
    'client',
    ['src/legacy'],
    {
      targetModules: ['client.alpha'],
      safeStarts: ['src/legacy/entry.ts'],
    },
  );
  const config = baseConfig([alpha], {
    schemaVersion: 3,
    migrationAreas: [area],
  });
  const root = fixture(config);
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    writeFixture(root, 'src/legacy/entry.ts', 'export {};\n');

    const valid = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.equal(valid.ok, true, formatModuleBoundaryReport(valid));
    assert.equal(valid.counts.migrationAreas, 1);
    assert.equal(valid.counts.orphanedMigrationSource, 0);
    assert.equal(valid.counts.overlappingMigrationSource, 0);

    writeFixture(root, 'src/legacy/general.ts', 'export {};\n');
    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify({
      ...config,
      migrationAreas: [{
        ...area,
        id: 'client.legacyGeneral',
        excludeRoots: ['src/legacy/entry.ts'],
        targetModules: [],
        safeStarts: ['src/legacy/general.ts'],
      }, {
        ...area,
        roots: ['src/legacy/entry.ts'],
      }],
    }, null, 2)}\n`);
    const carvedOut = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.equal(carvedOut.ok, true, formatModuleBoundaryReport(carvedOut));

    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify({
      ...config,
      migrationAreas: [],
    }, null, 2)}\n`);
    const orphaned = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(orphaned.errors.some(error => (
      error.code === 'orphaned-migration-source'
        && error.source === 'src/legacy/entry.ts'
    )));

    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify({
      ...config,
      migrationAreas: [
        area,
        migrationAreaEntry('client.overlap', 'client', ['src/legacy/entry.ts']),
      ],
    }, null, 2)}\n`);
    const overlapping = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(overlapping.errors.some(error => (
      error.code === 'overlapping-migration-source'
        && error.source === 'src/legacy/entry.ts'
    )));

    writeFixture(root, 'src/legacy/future/placeholder.ts', 'export {};\n');
    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify({
      ...config,
      migrationAreas: [{
        ...area,
        excludeRoots: ['src/legacy/future/placeholder.ts'],
      }, migrationAreaEntry('client.futureLegacy', 'client', ['src/legacy/future'], {
        safeStarts: ['src/legacy/future/placeholder.ts'],
      })],
    }, null, 2)}\n`);
    const structuralOverlap = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(structuralOverlap.errors.some(error => (
      error.code === 'overlapping-migration-areas'
    )));

    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify({
      ...config,
      migrationAreas: [{ ...area, id: 'client.alpha' }],
    }, null, 2)}\n`);
    const duplicateOwnerId = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(duplicateOwnerId.errors.some(error => (
      error.code === 'duplicate-ownership-id'
    )));
  } finally {
    cleanup(root);
  }
});

test('migration ownership rejects unsafe roots, architecture overlap and invalid artifacts', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const root = fixture(baseConfig([alpha], {
    schemaVersion: 3,
    migrationAreas: [migrationAreaEntry('client.invalid', 'server', ['src'], {
      excludeRoots: ['outside'],
      targetModules: ['client.alpha', 'client.missing'],
      focusedTests: ['npm run test:fixture && echo unsafe'],
      docs: ['docs/missing.md'],
      safeStarts: ['src/missing.ts'],
      routeScope: { mode: 'owners', owners: ['missing-route-owner'] },
      knownDebt: [],
    })],
  }));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    writeFixture(root, 'src/legacy.ts', 'export {};\n');
    writeFixture(root, 'src/shared/platform.ts', 'export {};\n');
    writeFixture(root, 'src/shared/seo/publicRouteInventory.json', JSON.stringify({
      schemaVersion: 1,
      canonicalOrigin: 'https://arena.example',
      routes: [{
        id: 'home',
        pattern: '/',
        kind: 'static',
        owner: 'product-shell',
        indexPolicy: 'index',
      }],
    }));

    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    for (const code of [
      'invalid-migration-runtime-root',
      'invalid-migration-exclusion',
      'migration-area-overlaps-architecture-root',
      'invalid-migration-target',
      'invalid-focused-test-command',
      'missing-migration-artifact',
      'invalid-migration-route-scope',
      'invalid-migration-debt',
    ]) {
      assert.ok(report.errors.some(error => error.code === code), `missing ${code}`);
    }
  } finally {
    cleanup(root);
  }
});

test('focused tests must be exact allowlisted npm scripts that exist in package.json', () => {
  const injected = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  injected.focusedTests = ['npm run test:fixture && curl https://example.invalid'];
  const root = fixture(baseConfig([injected]));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    const injectionReport = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(injectionReport.errors.some(error => error.code === 'invalid-focused-test-command'));

    const missing = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
    missing.focusedTests = ['npm run test:missing'];
    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify(baseConfig([missing]), null, 2)}\n`);
    const missingReport = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(missingReport.errors.some(error => error.code === 'missing-focused-test-script'));

    writeFixture(root, 'package.json', JSON.stringify({
      scripts: {
        'test:fixture': 'node --test tests/focused.test.ts',
        'pretest:fixture': 'node unsafe-hook.js',
      },
    }));
    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify(baseConfig([
      moduleEntry('client.alpha', 'client', 'src/modules/alpha'),
    ]), null, 2)}\n`);
    const hookReport = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(hookReport.errors.some(error => error.code === 'focused-test-lifecycle-hook'));
  } finally {
    cleanup(root);
  }
});

test('validates canonical shared roots as first-class owned architecture entries', () => {
  const config = baseConfig([]);
  const root = fixture(config);
  try {
    const metadata = validateModuleInventoryMetadata({ rootDir: root, config, now: NOW });
    assert.equal(metadata.ok, true);
    assert.deepEqual(metadata.sharedRoots, config.sharedRoots);

    const missingOwner = structuredClone(config);
    missingOwner.sharedRoots[0].owner = '';
    const missingOwnerMetadata = validateModuleInventoryMetadata({
      rootDir: root,
      config: missingOwner,
      now: NOW,
    });
    assert.ok(missingOwnerMetadata.errors.some(error => error.code === 'invalid-shared-root'));

    const unsafeOwner = structuredClone(config);
    unsafeOwner.sharedRoots[0].owner = 'architecture-test\nInjected owner';
    const unsafeOwnerMetadata = validateModuleInventoryMetadata({
      rootDir: root,
      config: unsafeOwner,
      now: NOW,
    });
    assert.ok(unsafeOwnerMetadata.errors.some(error => error.code === 'invalid-shared-root'));

    const escapedSafeStart = structuredClone(config);
    escapedSafeStart.sharedRoots[0].safeStarts = ['docs/modules.md'];
    const escapedSafeStartMetadata = validateModuleInventoryMetadata({
      rootDir: root,
      config: escapedSafeStart,
      now: NOW,
    });
    assert.ok(escapedSafeStartMetadata.errors.some(error => (
      error.code === 'missing-shared-root-artifact'
    )));

    const injectedTest = structuredClone(config);
    injectedTest.sharedRoots[1].focusedTests = [
      'npm run test:fixture && touch /tmp/unsafe',
    ];
    const injectedTestMetadata = validateModuleInventoryMetadata({
      rootDir: root,
      config: injectedTest,
      now: NOW,
    });
    assert.ok(injectedTestMetadata.errors.some(error => (
      error.code === 'invalid-focused-test-command'
    )));

    const duplicateMetadata = structuredClone(config);
    duplicateMetadata.sharedRoots[0].docs.push(duplicateMetadata.sharedRoots[0].docs[0]);
    const duplicateMetadataReport = validateModuleInventoryMetadata({
      rootDir: root,
      config: duplicateMetadata,
      now: NOW,
    });
    assert.ok(duplicateMetadataReport.errors.some(error => (
      error.code === 'invalid-shared-root-ownership'
        && /duplicate docs/i.test(error.message)
    )));

    const collidingId = structuredClone(config);
    collidingId.sharedRoots[0].id = collidingId.migrationAreas[0].id;
    const collidingIdReport = validateModuleInventoryMetadata({
      rootDir: root,
      config: collidingId,
      now: NOW,
    });
    assert.ok(collidingIdReport.errors.some(error => error.code === 'duplicate-ownership-id'));

    const oldShape = { ...config, sharedRoots: { client: ['src/shared'], server: ['server/shared'] } };
    const oldShapeReport = validateModuleInventoryMetadata({ rootDir: root, config: oldShape, now: NOW });
    assert.ok(oldShapeReport.errors.some(error => error.code === 'invalid-boundary-roots'));

    const missingScript = structuredClone(config);
    missingScript.sharedRoots[0].focusedTests = ['npm run test:missing'];
    const missingScriptReport = validateModuleInventoryMetadata({
      rootDir: root,
      config: missingScript,
      now: NOW,
    });
    assert.ok(missingScriptReport.errors.some(error => error.code === 'missing-focused-test-script'));

    writeFixture(root, 'package.json', JSON.stringify({
      scripts: {
        'test:fixture': 'node --test tests/focused.test.ts',
        'pretest:fixture': 'node unsafe-hook.js',
      },
    }));
    const lifecycleHookReport = validateModuleInventoryMetadata({ rootDir: root, config, now: NOW });
    assert.ok(lifecycleHookReport.errors.some(error => (
      error.code === 'focused-test-lifecycle-hook'
        && /shared root/i.test(error.message)
    )));
    writeFixture(root, 'package.json', JSON.stringify({
      scripts: { 'test:fixture': 'node --test tests/focused.test.ts' },
    }));

    writeFixture(root, 'src/modules/borrowed/file.ts', 'export {};\n');
    symlinkSync('../modules/borrowed', join(root, 'src/shared/borrowed'), 'dir');
    const escapedThroughParent = structuredClone(config);
    escapedThroughParent.sharedRoots[0].safeStarts = ['src/shared/borrowed/file.ts'];
    const escapedThroughParentReport = validateModuleInventoryMetadata({
      rootDir: root,
      config: escapedThroughParent,
      now: NOW,
    });
    assert.ok(escapedThroughParentReport.errors.some(error => (
      error.code === 'missing-shared-root-artifact'
        && /safe start is invalid/i.test(error.message)
    )));

    mkdirSync(join(root, 'src/shared-real'), { recursive: true });
    rmSync(join(root, 'src/shared'), { recursive: true, force: true });
    symlinkSync(join(root, 'src/shared-real'), join(root, 'src/shared'), 'dir');
    const symlinkedRootReport = validateModuleInventoryMetadata({ rootDir: root, config, now: NOW });
    assert.ok(symlinkedRootReport.errors.some(error => (
      error.code === 'missing-shared-root-artifact'
        && /root is missing/i.test(error.message)
    )));
  } finally {
    cleanup(root);
  }
});

test('requires canonical module and shared roots so configuration cannot disable the gate', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const root = fixture(baseConfig([alpha], {
    moduleRoots: [],
    sharedRoots: [
      sharedRootEntry('shared-root.client', 'client', 'src'),
      sharedRootEntry('shared-root.server', 'server', 'server/shared'),
    ],
  }));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    writeFixture(root, 'src/modules/unregistered/public.ts', 'export {};\n');
    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(report.errors.some(error => error.code === 'invalid-boundary-roots'));
    assert.ok(report.errors.some(error => error.code === 'module-inventory-mismatch'));
  } finally {
    cleanup(root);
  }
});

test('requires each module public entry to be its public.ts regular file', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  alpha.publicEntry = 'src/modules/alpha/internal.ts';
  const root = fixture(baseConfig([alpha]));
  try {
    writeFixture(root, 'src/modules/alpha/internal.ts', 'export {};\n');
    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(report.errors.some(error => error.code === 'invalid-public-entry'));
    assert.equal(report.counts.missingPublicEntry, 1);

    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify(baseConfig([
      moduleEntry('client.alpha', 'client', 'src/modules/alpha'),
    ]), null, 2)}\n`);
    symlinkSync('internal.ts', join(root, 'src/modules/alpha/public.ts'));
    const symlinkReport = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(symlinkReport.errors.some(error => error.code === 'invalid-public-entry'));
    assert.equal(symlinkReport.counts.missingPublicEntry, 1);
  } finally {
    cleanup(root);
  }
});

test('derives module identity and dependencies from canonical roots and actual edges', () => {
  const alpha = moduleEntry('server.wrongName', 'server', 'src/modules/alpha', ['client.beta']);
  const beta = moduleEntry('client.beta', 'client', 'src/modules/beta');
  const root = fixture(baseConfig([alpha, beta]));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    writeFixture(root, 'src/modules/beta/public.ts', 'export {};\n');
    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(report.errors.some(error => error.code === 'invalid-module-runtime-root'));
    assert.ok(report.errors.some(error => error.code === 'invalid-module-id'));
    assert.ok(report.errors.some(error => error.code === 'stale-module-dependency'));
  } finally {
    cleanup(root);
  }
});
