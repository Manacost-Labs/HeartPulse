import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';

import * as boundaryModule from '../scripts/check-module-boundaries.mjs';
import { loadAgentImpact } from '../scripts/agent-impact.mjs';
import { loadAgentMap } from '../scripts/agent-map.mjs';
import {
  isSafeMetadataText,
  singleLineDisplay,
} from '../scripts/lib/diagnostic-text-policy.mjs';
import {
  isSafeRelativePath,
  normalizeRepositoryPath,
  projectPath,
  repositoryPathProjectsWithin,
} from '../scripts/lib/repository-path-policy.mjs';
import { readPublicRouteInventory } from '../scripts/lib/public-route-inventory.mjs';
import {
  NOW,
  baseConfig,
  cleanup,
  fixture,
  migrationAreaEntry,
  moduleEntry,
  writeFixture,
} from './support/module-boundary-fixture.mjs';

const {
  analyzeModuleBoundaries,
  formatModuleBoundaryReport,
  validateModuleInventoryMetadata,
} = boundaryModule;

test('POSIX graph paths preserve literal backslashes until strict validation rejects them', {
  skip: process.platform === 'win32',
}, () => {
  const graphPath = projectPath('/repository', '/repository/src/literal\\name.ts');
  assert.equal(graphPath, 'src/literal\\name.ts');
  assert.equal(isSafeRelativePath(graphPath), false);
  assert.equal(normalizeRepositoryPath(graphPath, '/repository'), 'src/literal/name.ts');
});

test('diagnostic text policy rejects and escapes every line-control family', () => {
  const unsafeCharacters = [
    ['\n', '\\u{A}'],
    ['\r', '\\u{D}'],
    ['\t', '\\u{9}'],
    ['\u001B', '\\u{1B}'],
    ['\u2028', '\\u{2028}'],
    ['\u2029', '\\u{2029}'],
    ['\u202E', '\\u{202E}'],
  ];
  for (const [character, escaped] of unsafeCharacters) {
    assert.equal(isSafeMetadataText(`safe${character}text`), false);
    assert.equal(singleLineDisplay(`safe${character}text`), `safe${escaped}text`);
  }
  assert.equal(isSafeMetadataText('architecture-owner'), true);
});

test('boundary config must be a canonical regular repository file without symlinks', () => {
  const config = baseConfig([]);
  const root = fixture(config);
  const outside = mkdtempSync(join(tmpdir(), 'arena-boundaries-config-outside-'));
  try {
    writeFixture(outside, 'external.json', `${JSON.stringify(config, null, 2)}\n`);
    symlinkSync('module-boundaries.json', join(root, 'config/linked.json'));
    symlinkSync('config', join(root, 'config-link'));
    symlinkSync(outside, join(root, 'outside-config'));

    const escapedConfig = relative(root, join(outside, 'external.json')).replaceAll('\\', '/');
    const cases = [{
      configPath: join(root, 'config/module-boundaries.json'),
      message: `Module boundary config path must be a canonical repository-relative path: ${join(root, 'config/module-boundaries.json')}`,
    }, {
      configPath: escapedConfig,
      message: `Module boundary config path must be a canonical repository-relative path: ${escapedConfig}`,
    }, {
      configPath: './config/module-boundaries.json',
      message: 'Module boundary config path must be a canonical repository-relative path: ./config/module-boundaries.json',
    }, {
      configPath: 'config/linked.json',
      message: 'Module boundary config path must not contain symbolic links: config/linked.json',
    }, {
      configPath: 'config-link/module-boundaries.json',
      message: 'Module boundary config path must not contain symbolic links: config-link/module-boundaries.json',
    }, {
      configPath: 'outside-config/external.json',
      message: 'Module boundary config path must not contain symbolic links: outside-config/external.json',
    }, {
      configPath: 'config',
      message: 'Module boundary config must be a regular file: config',
    }, {
      configPath: 'config/missing.json',
      message: 'Module boundary config is missing: config/missing.json',
    }, {
      configPath: 'C:/external.json',
      message: 'Module boundary config path must be a canonical repository-relative path: C:/external.json',
    }, {
      configPath: 'config/unsafe\nname.json',
      message: 'Module boundary config path must be a canonical repository-relative path: config/unsafe\\u{A}name.json',
    }];

    const expectedReport = message => ({
      ok: false,
      counts: {
        modules: 0,
        migrationAreas: 0,
        sources: 0,
        ownershipSources: 0,
        edges: 0,
        orphanedMigrationSource: 0,
        overlappingMigrationSource: 0,
        missingPublicEntry: 0,
        internalImport: 0,
        moduleLegacyImport: 0,
        runtimeCrossing: 0,
        typeCycle: 0,
        runtimeCycle: 0,
      },
      violations: {
        missingPublicEntry: [],
        internalImport: [],
        moduleLegacyImport: [],
        runtimeCrossing: [],
        typeCycle: [],
      },
      cycles: { runtime: [], typeInclusive: [] },
      edges: [],
      errors: [{ code: 'invalid-config', message }],
    });
    assert.deepEqual(
      cases.map(({ configPath }) => analyzeModuleBoundaries({ rootDir: root, configPath, now: NOW })),
      cases.map(({ message }) => expectedReport(message)),
    );
  } finally {
    cleanup(root);
    cleanup(outside);
  }
});

test('public route inventory rejects internal and external symlinked parent paths', () => {
  const root = fixture(baseConfig([]));
  const outside = mkdtempSync(join(tmpdir(), 'arena-routes-outside-'));
  const linkedParent = join(root, 'src/shared/seo');
  const source = `${JSON.stringify({
    schemaVersion: 1,
    canonicalOrigin: 'https://arena.example',
    routes: [],
  })}\n`;
  try {
    writeFixture(root, 'route-data/publicRouteInventory.json', source);
    writeFixture(outside, 'publicRouteInventory.json', source);
    symlinkSync(join(root, 'route-data'), linkedParent, 'dir');
    assert.throws(() => readPublicRouteInventory(root), {
      message: 'Public route inventory path must not contain symbolic links: src/shared/seo/publicRouteInventory.json',
    });

    rmSync(linkedParent);
    symlinkSync(outside, linkedParent, 'dir');
    assert.throws(() => readPublicRouteInventory(root), {
      message: 'Repository file resolves outside the repository: src/shared/seo/publicRouteInventory.json',
    });
  } finally {
    cleanup(root);
    cleanup(outside);
  }
});

test('public route inventory preserves sanitized system read errors', {
  skip: process.platform === 'win32' || process.getuid?.() === 0,
}, () => {
  const root = fixture(baseConfig([]));
  const routePath = join(root, 'src/shared/seo/publicRouteInventory.json');
  try {
    writeFixture(root, 'src/shared/seo/publicRouteInventory.json', '{}\n');
    chmodSync(routePath, 0);
    assert.throws(
      () => readPublicRouteInventory(root),
      /^Error: Public route inventory is not valid JSON: EACCES:/,
    );
  } finally {
    chmodSync(routePath, 0o600);
    cleanup(root);
  }
});

test('boundary config uses the real repository root as its trusted anchor', () => {
  const root = fixture(baseConfig([]));
  const aliases = mkdtempSync(join(tmpdir(), 'arena-boundaries-root-alias-'));
  try {
    const rootAlias = join(aliases, 'repository');
    symlinkSync(root, rootAlias);
    const direct = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    const throughAlias = analyzeModuleBoundaries({ rootDir: rootAlias, now: NOW });
    assert.deepEqual(throughAlias, direct);
  } finally {
    cleanup(aliases);
    cleanup(root);
  }
});

test('inventory metadata rejects non-canonical repository paths consistently', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const config = baseConfig([alpha]);
  const root = fixture(config);
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    const cases = [{
      code: 'unsafe-migration-root',
      mutate(candidate) {
        candidate.migrationAreas[0].roots = ['src/.'];
      },
    }, {
      code: 'invalid-migration-exclusion',
      mutate(candidate) {
        candidate.migrationAreas[0].excludeRoots = ['src/modules//'];
      },
    }, {
      code: 'missing-migration-artifact',
      mutate(candidate) {
        candidate.migrationAreas[0].safeStarts = ['src//__migration-fixture.ts'];
      },
    }, {
      code: 'missing-migration-artifact',
      mutate(candidate) {
        candidate.migrationAreas[0].docs = ['docs//modules.md'];
      },
    }, {
      code: 'missing-module-artifact',
      mutate(candidate) {
        candidate.modules[0].docs = ['./docs/modules.md'];
      },
    }];

    for (const fixtureCase of cases) {
      const candidate = structuredClone(config);
      fixtureCase.mutate(candidate);
      const report = validateModuleInventoryMetadata({
        rootDir: root,
        config: candidate,
        now: NOW,
      });
      assert.ok(
        report.errors.some(error => error.code === fixtureCase.code),
        `missing ${fixtureCase.code}: ${JSON.stringify(report.errors)}`,
      );
    }
  } finally {
    cleanup(root);
  }
});

test('graph and ownership scans reject source paths that can inject formatted output', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const root = fixture(baseConfig([alpha]));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export const alpha = true;\n');
    const unsafePath = 'src/legacy/caller\nFocused tests:\n  - npm run test:fixture && id.ts';
    writeFixture(root, unsafePath, "import { alpha } from '../modules/alpha/public.js';\n");

    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.equal(report.ok, false);
    assert.ok(report.errors.some(error => error.code === 'unsafe-source-path'));
    assert.ok(report.errors.some(error => error.code === 'unsafe-ownership-path'));
    assert.doesNotMatch(formatModuleBoundaryReport(report), /\nFocused tests:/);
    assert.throws(
      () => loadAgentImpact({ repositoryRoot: root, selector: 'client.alpha' }),
      /module graph is invalid/i,
    );
    assert.throws(
      () => loadAgentMap({ repositoryRoot: root }),
      /module graph is invalid/i,
    );
  } finally {
    cleanup(root);
  }
});

test('migration roots and safe starts cannot rely on symbolic links', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const config = baseConfig([alpha], {
    migrationAreas: [
      migrationAreaEntry('client.linkedRoot', 'client', ['src/root-link'], {
        safeStarts: ['src/root-link/entry.ts'],
      }),
      migrationAreaEntry('client.linkedStart', 'client', ['src/legacy'], {
        safeStarts: ['src/legacy/entry.ts'],
      }),
      migrationAreaEntry('client.parentLinkedRoot', 'client', ['src/module-alias/alpha'], {
        safeStarts: ['src/module-alias/alpha/public.ts'],
      }),
    ],
  });
  const root = fixture(config);
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    writeFixture(root, 'src/root-target/entry.ts', 'export {};\n');
    symlinkSync('root-target', join(root, 'src/root-link'));
    writeFixture(root, 'src/legacy/real.ts', 'export {};\n');
    symlinkSync('real.ts', join(root, 'src/legacy/entry.ts'));
    symlinkSync('modules', join(root, 'src/module-alias'));

    const report = validateModuleInventoryMetadata({ rootDir: root, config });

    assert.ok(report.errors.some(error => (
      error.code === 'unsafe-migration-root'
        && error.message.includes('src/root-link')
    )));
    assert.ok(report.errors.some(error => (
      error.code === 'unsafe-migration-root'
        && error.message.includes('src/module-alias/alpha')
    )));
    assert.ok(report.errors.some(error => (
      error.code === 'missing-migration-artifact'
        && error.message.includes('src/legacy/entry.ts')
    )));
  } finally {
    cleanup(root);
  }
});

test('owner containment follows the nearest existing parent without crossing ownership', () => {
  const root = fixture(baseConfig([]));
  const outside = mkdtempSync(join(tmpdir(), 'arena-boundaries-owner-outside-'));
  try {
    writeFixture(root, 'src/owner/existing.ts', 'export {};\n');
    writeFixture(root, 'src/other/existing.ts', 'export {};\n');
    writeFixture(outside, 'existing.ts', 'export {};\n');
    symlinkSync('../other', join(root, 'src/owner/borrowed'));
    symlinkSync(outside, join(root, 'src/owner/external'));
    symlinkSync('missing-target', join(root, 'src/owner/broken'));

    assert.equal(
      repositoryPathProjectsWithin(root, 'src/owner/future/entry.ts', 'src/owner'),
      true,
    );
    assert.equal(
      repositoryPathProjectsWithin(root, 'src/owner/borrowed/future.ts', 'src/owner'),
      false,
    );
    assert.equal(
      repositoryPathProjectsWithin(root, 'src/owner/external/future.ts', 'src/owner'),
      false,
    );
    assert.equal(
      repositoryPathProjectsWithin(root, 'src/owner/broken/future.ts', 'src/owner'),
      false,
    );
  } finally {
    cleanup(root);
    cleanup(outside);
  }
});

test('migration safe starts resolve within their lexically owning root', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const alphaArea = migrationAreaEntry(
    'client.legacyAlpha',
    'client',
    ['src/legacy-a', 'src/legacy-c'],
    {
      excludeRoots: ['src/legacy-a/excluded'],
      targetModules: ['client.alpha'],
      safeStarts: [
        'src/legacy-a/entry.ts',
        'src/legacy-a/borrowed/entry.ts',
        'src/legacy-a/sibling-root/entry.ts',
        'src/legacy-a/excluded-link/entry.ts',
        'src/legacy-a/external/entry.ts',
        'src/legacy-a/future/entry.ts',
        'src/legacy-c/entry.ts',
      ],
    },
  );
  const betaArea = migrationAreaEntry('client.legacyBeta', 'client', ['src/legacy-b'], {
    targetModules: ['client.alpha'],
    safeStarts: ['src/legacy-b/entry.ts'],
  });
  const config = baseConfig([alpha], {
    schemaVersion: 3,
    migrationAreas: [alphaArea, betaArea],
  });
  const root = fixture(config);
  const outside = mkdtempSync(join(tmpdir(), 'arena-boundaries-migration-outside-'));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    writeFixture(root, 'src/legacy-a/entry.ts', 'export {};\n');
    writeFixture(root, 'src/legacy-a/excluded/entry.ts', 'export {};\n');
    writeFixture(root, 'src/legacy-b/entry.ts', 'export {};\n');
    writeFixture(root, 'src/legacy-c/entry.ts', 'export {};\n');
    writeFixture(outside, 'entry.ts', 'export {};\n');
    symlinkSync('../legacy-b', join(root, 'src/legacy-a/borrowed'));
    symlinkSync('../legacy-c', join(root, 'src/legacy-a/sibling-root'));
    symlinkSync('excluded', join(root, 'src/legacy-a/excluded-link'));
    symlinkSync(outside, join(root, 'src/legacy-a/external'));

    const metadata = validateModuleInventoryMetadata({ rootDir: root, config });
    assert.deepEqual(
      metadata.errors,
      [
        {
          code: 'missing-migration-artifact',
          message: 'migration area client.legacyAlpha safe start is invalid: src/legacy-a/borrowed/entry.ts',
        },
        {
          code: 'missing-migration-artifact',
          message: 'migration area client.legacyAlpha safe start is invalid: src/legacy-a/sibling-root/entry.ts',
        },
        {
          code: 'missing-migration-artifact',
          message: 'migration area client.legacyAlpha safe start is invalid: src/legacy-a/excluded-link/entry.ts',
        },
        {
          code: 'missing-migration-artifact',
          message: 'migration area client.legacyAlpha safe start is invalid: src/legacy-a/external/entry.ts',
        },
        {
          code: 'missing-migration-artifact',
          message: 'migration area client.legacyAlpha safe start is invalid: src/legacy-a/future/entry.ts',
        },
      ],
    );
  } finally {
    cleanup(root);
    cleanup(outside);
  }
});

test('module and migration documentation cannot escape through a parent symlink', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const root = fixture(baseConfig([alpha]));
  const outside = mkdtempSync(join(tmpdir(), 'arena-boundaries-docs-outside-'));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    writeFixture(outside, 'info.md', '# Outside\n');
    symlinkSync(outside, join(root, 'docs/external'));

    const moduleDocsConfig = baseConfig([{ ...alpha, docs: ['docs/external/info.md'] }]);
    writeFixture(
      root,
      'config/module-boundaries.json',
      `${JSON.stringify(moduleDocsConfig, null, 2)}\n`,
    );
    const moduleDocsReport = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(moduleDocsReport.errors.some(error => error.code === 'missing-module-artifact'));

    const migrationDocsConfig = baseConfig([alpha]);
    migrationDocsConfig.migrationAreas[0].docs = ['docs/external/info.md'];
    writeFixture(
      root,
      'config/module-boundaries.json',
      `${JSON.stringify(migrationDocsConfig, null, 2)}\n`,
    );
    const migrationDocsReport = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(migrationDocsReport.errors.some(error => (
      error.code === 'missing-migration-artifact'
    )));
  } finally {
    cleanup(root);
    cleanup(outside);
  }
});
