import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import * as boundaryModule from '../scripts/check-module-boundaries.mjs';
import { loadAgentImpact } from '../scripts/agent-impact.mjs';
import { loadAgentMap } from '../scripts/agent-map.mjs';
import {
  walkOwnershipFiles,
  walkSourceFiles,
} from '../scripts/lib/module-boundary-source-scan.mjs';

const {
  analyzeModuleBoundaries,
  formatModuleBoundaryReport,
  validateModuleInventoryMetadata,
} = boundaryModule;
const CHECKER_URL = new URL('../scripts/check-module-boundaries.mjs', import.meta.url);

const NOW = new Date('2026-08-17T00:00:00.000Z');

function writeFixture(root, path, contents = '') {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function moduleEntry(id, runtime, root, dependencies = []) {
  return {
    id,
    runtime,
    root,
    purpose: `${id} fixture`,
    owner: 'architecture-test',
    publicEntry: `${root}/public.ts`,
    dependencies,
    focusedTests: ['npm run test:fixture'],
    docs: ['docs/modules.md'],
  };
}

function migrationAreaEntry(id, runtime, roots, overrides = {}) {
  return {
    id,
    runtime,
    roots,
    excludeRoots: [],
    purpose: `${id} migration fixture`,
    owner: 'architecture-test',
    targetModules: [],
    focusedTests: ['npm run test:fixture'],
    docs: ['docs/modules.md'],
    safeStarts: [],
    routeScope: { mode: 'none' },
    knownDebt: [`${id} remains outside a canonical module.`],
    ...overrides,
  };
}

function sharedRootEntry(id, runtime, root, overrides = {}) {
  return {
    id,
    runtime,
    root,
    purpose: `${id} shared fixture`,
    owner: 'architecture-test',
    focusedTests: ['npm run test:fixture'],
    docs: ['docs/modules.md'],
    safeStarts: [`${root}/__shared-fixture.ts`],
    ...overrides,
  };
}

function baseConfig(modules, overrides = {}) {
  return {
    schemaVersion: 3,
    moduleRoots: ['src/modules', 'server/modules'],
    sharedRoots: [
      sharedRootEntry('shared-root.client', 'client', 'src/shared'),
      sharedRootEntry('shared-root.server', 'server', 'server/shared'),
    ],
    modules,
    migrationAreas: [
      migrationAreaEntry('client.fixtureLegacy', 'client', ['src'], {
        excludeRoots: ['src/modules', 'src/shared'],
        safeStarts: ['src/__migration-fixture.ts'],
      }),
      migrationAreaEntry('server.fixtureLegacy', 'server', ['server'], {
        excludeRoots: ['server/modules', 'server/shared'],
        safeStarts: ['server/__migration-fixture.ts'],
      }),
      migrationAreaEntry('shared.fixtureLegacy', 'shared', ['shared'], {
        safeStarts: ['shared/__migration-fixture.ts'],
      }),
    ],
    allowlistBudgets: {
      missingPublicEntry: 0,
      internalImport: 0,
      moduleLegacyImport: 0,
      runtimeCrossing: 0,
      typeCycle: 0,
    },
    exceptions: {
      missingPublicEntry: [],
      internalImport: [],
      moduleLegacyImport: [],
      runtimeCrossing: [],
      typeCycle: [],
    },
    ...overrides,
  };
}

function fixture(config) {
  const root = mkdtempSync(join(tmpdir(), 'arena-boundaries-'));
  writeFixture(root, 'tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      baseUrl: '.',
      paths: { '@/*': ['src/*'] },
      jsx: 'react-jsx',
    },
  }));
  writeFixture(root, 'tests/focused.test.ts', 'export {};\n');
  writeFixture(root, 'package.json', JSON.stringify({
    scripts: {
      'test:fixture': 'node --test tests/focused.test.ts',
    },
  }));
  writeFixture(root, 'docs/modules.md', '# Fixture modules\n');
  for (const architectureRoot of ['src/modules', 'src/shared', 'server/modules', 'server/shared']) {
    mkdirSync(join(root, architectureRoot), { recursive: true });
  }
  const fixtureSafeStarts = new Set([
    'src/__migration-fixture.ts',
    'server/__migration-fixture.ts',
    'shared/__migration-fixture.ts',
  ]);
  for (const area of config.migrationAreas ?? []) {
    for (const safeStart of area.safeStarts ?? []) {
      if (fixtureSafeStarts.has(safeStart)) writeFixture(root, safeStart, 'export {};\n');
    }
  }
  for (const sharedRoot of config.sharedRoots ?? []) {
    for (const safeStart of sharedRoot.safeStarts ?? []) {
      if (safeStart.endsWith('/__shared-fixture.ts')) {
        writeFixture(root, safeStart, 'export {};\n');
      }
    }
  }
  writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify(config, null, 2)}\n`);
  return root;
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

test('source and ownership scanners keep distinct roots, extensions and symlink diagnostics', () => {
  const root = mkdtempSync(join(tmpdir(), 'arena-boundary-scans-'));
  try {
    writeFixture(root, 'src/app.ts', 'export {};\n');
    writeFixture(root, 'src/config.json', '{}\n');
    writeFixture(root, 'server/job.py', 'pass\n');
    writeFixture(root, 'shared/theme.css', ':root {}\n');
    writeFixture(root, 'public/bg-legacy/runtime.js', 'export {};\n');
    writeFixture(root, 'public/bg-legacy/catalog.json', '{}\n');
    writeFixture(root, 'public/bg-legacy/generator.py', 'pass\n');
    writeFixture(root, 'public/bg-legacy/actual.js', 'export {};\n');
    symlinkSync('actual.js', join(root, 'public/bg-legacy/linked.js'));

    const sourceScan = walkSourceFiles(root);
    assert.deepEqual(sourceScan.errors, []);
    assert.deepEqual(sourceScan.files, [
      join(root, 'shared/theme.css'),
      join(root, 'src/app.ts'),
    ]);

    const ownershipScan = walkOwnershipFiles(root);
    assert.deepEqual(ownershipScan.files, [
      'public/bg-legacy/actual.js',
      'public/bg-legacy/catalog.json',
      'public/bg-legacy/generator.py',
      'public/bg-legacy/runtime.js',
      'server/job.py',
      'shared/theme.css',
      'src/app.ts',
      'src/config.json',
    ]);
    assert.deepEqual(ownershipScan.errors, [{
      code: 'unsafe-migration-source-symlink',
      message: 'migration ownership trees must not contain symlinks: public/bg-legacy/linked.js',
    }]);
  } finally {
    cleanup(root);
  }
});

test('boundary checker keeps its exact public exports, report text and silent import contract', () => {
  assert.deepEqual(Object.keys(boundaryModule).sort(), [
    'analyzeModuleBoundaries',
    'formatModuleBoundaryReport',
    'validateModuleInventoryMetadata',
  ]);
  assert.equal(formatModuleBoundaryReport({
    ok: true,
    counts: {
      modules: 2,
      migrationAreas: 3,
      sources: 5,
      ownershipSources: 7,
      edges: 11,
      orphanedMigrationSource: 0,
      overlappingMigrationSource: 0,
      missingPublicEntry: 0,
      internalImport: 0,
      moduleLegacyImport: 1,
      runtimeCrossing: 2,
      typeCycle: 3,
      runtimeCycle: 0,
    },
    errors: [],
  }), [
    '[module-boundaries] 2 modules, 3 migration areas, 5 graph sources, 7 owned sources, 11 resolved edges',
    '[module-boundaries] migration coverage: orphaned=0, overlapping=0',
    '[module-boundaries] exceptions: missing-public=0, internal=0, module-legacy=1, runtime-crossing=2, type-cycles=3',
    '[module-boundaries] runtime cycles: 0',
    '[module-boundaries] dependency contract passed',
  ].join('\n'));
  assert.equal(formatModuleBoundaryReport({
    ok: false,
    counts: {
      modules: 0,
      edges: 0,
      missingPublicEntry: 0,
      internalImport: 0,
      moduleLegacyImport: 0,
      runtimeCrossing: 0,
      typeCycle: 0,
      runtimeCycle: 0,
    },
    errors: [{
      code: 'first-error',
      message: 'first message',
      edge: { source: 'src/a.ts', target: 'src/b.ts', kind: 'type' },
    }, {
      code: 'second-error',
      message: 'second message',
    }],
  }), [
    '[module-boundaries] 0 modules, 0 migration areas, 0 graph sources, 0 owned sources, 0 resolved edges',
    '[module-boundaries] migration coverage: orphaned=0, overlapping=0',
    '[module-boundaries] exceptions: missing-public=0, internal=0, module-legacy=0, runtime-crossing=0, type-cycles=0',
    '[module-boundaries] runtime cycles: 0',
    '  [first-error] first message: src/a.ts -> src/b.ts (type)',
    '  [second-error] second message',
    '[module-boundaries] dependency contract failed',
  ].join('\n'));

  const imported = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `import(${JSON.stringify(CHECKER_URL.href)})`,
  ], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, '');
  assert.equal(imported.stderr, '');
});

test('boundary checker CLI preserves stdout, stderr and exit codes', () => {
  const root = fixture(baseConfig([]));
  try {
    const expectedReport = [
      '[module-boundaries] 0 modules, 3 migration areas, 5 graph sources, 5 owned sources, 0 resolved edges',
      '[module-boundaries] migration coverage: orphaned=0, overlapping=0',
      '[module-boundaries] exceptions: missing-public=0, internal=0, module-legacy=0, runtime-crossing=0, type-cycles=0',
      '[module-boundaries] runtime cycles: 0',
      '[module-boundaries] dependency contract passed',
      '',
    ].join('\n');
    const success = spawnSync(process.execPath, [CHECKER_URL.pathname, '--root', root], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(success.status, 0, success.stderr);
    assert.equal(success.stdout, expectedReport);
    assert.equal(success.stderr, '');

    const config = baseConfig([]);
    writeFixture(root, 'config/alternate-boundaries.json', `${JSON.stringify(config, null, 2)}\n`);
    const alternate = spawnSync(process.execPath, [
      CHECKER_URL.pathname,
      '--root',
      root,
      '--config',
      'config/alternate-boundaries.json',
    ], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(alternate.status, 0, alternate.stderr);
    assert.equal(alternate.stdout, expectedReport);
    assert.equal(alternate.stderr, '');

    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify({
      ...config,
      schemaVersion: 999,
    }, null, 2)}\n`);
    const invalid = spawnSync(process.execPath, [CHECKER_URL.pathname, '--root', root], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, expectedReport.replace(
      '[module-boundaries] dependency contract passed\n',
      '  [invalid-schema-version] module-boundaries schemaVersion must be 3\n[module-boundaries] dependency contract failed\n',
    ));
    assert.equal(invalid.stderr, '');

    const unknown = spawnSync(process.execPath, [CHECKER_URL.pathname, '--unknown'], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(unknown.status, 2);
    assert.equal(unknown.stdout, '');
    assert.equal(unknown.stderr, 'Unknown argument: --unknown\n');
  } finally {
    cleanup(root);
  }
});

test('boundary diagnostics keep their cross-stage insertion order', () => {
  const config = baseConfig([], { schemaVersion: 999, moduleRoots: [] });
  const root = fixture(config);
  try {
    rmSync(join(root, 'tsconfig.json'));
    writeFixture(
      root,
      'src/__migration-fixture.ts',
      "const target = './dynamic'; void import(target);\n",
    );
    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.deepEqual(report.errors.map(error => error.code), [
      'invalid-schema-version',
      'invalid-boundary-roots',
      'missing-tsconfig',
      'dynamic-module-import',
    ]);
  } finally {
    cleanup(root);
  }
});

test('resolves imports from TS and JS sources, including type, query, alias, and style edges', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const beta = moduleEntry('client.beta', 'client', 'src/modules/beta', ['client.alpha']);
  const root = fixture(baseConfig([alpha, beta]));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', "export { publicValue } from './internal.js';\n");
    writeFixture(root, 'src/modules/alpha/internal.ts', 'export const publicValue = 1; export type PrivateType = number;\n');
    writeFixture(root, 'src/modules/alpha/theme.css', '.alpha {}\n');
    writeFixture(root, 'src/modules/beta/public.ts', "export { publicValue } from '../alpha/public.js';\n");
    writeFixture(root, 'src/app/static.ts', "import { publicValue } from '../modules/alpha/internal.js'; void publicValue;\n");
    writeFixture(root, 'src/app/dynamic.ts', "void import('@/modules/alpha/internal.js', { with: { type: 'json' } });\n");
    writeFixture(root, 'src/app/reexport.ts', "export { publicValue } from '../modules/alpha/internal.js';\n");
    writeFixture(root, 'src/app/type-reexport.ts', "export { type PrivateType } from '../modules/alpha/internal.js';\n");
    writeFixture(root, 'src/app/require.ts', "require('../modules/alpha/internal.js');\n");
    writeFixture(root, 'src/app/import-type.ts', "export type Imported = import('../modules/alpha/internal.js').PrivateType;\n");
    writeFixture(root, 'src/app/query.ts', "import rawSource from '../modules/alpha/internal.ts?raw'; void rawSource;\n");
    writeFixture(root, 'src/app/bypass.js', "import { publicValue } from '../modules/alpha/internal.js'; void publicValue;\n");
    writeFixture(root, 'src/app/style.ts', "import '../modules/alpha/theme.css';\n");
    writeFixture(root, 'src/app/glob.ts', "const modules = import.meta.glob('../modules/alpha/*.ts'); void modules;\n");
    writeFixture(root, 'src/app/negative-glob.ts', "const modules = import.meta.glob(['@/modules/alpha/*.ts', '!@/modules/alpha/internal.ts']); void modules;\n");
    writeFixture(root, 'src/app/styles.css', "@import '../modules/alpha/theme.css';\n");
    writeFixture(root, 'src/app/leak.d.ts', "import type { PrivateType } from '../modules/alpha/internal.js';\n");

    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    const privateEdges = report.violations.internalImport.map(({ source, target, kind }) => ({ source, target, kind }));

    assert.equal(report.counts.internalImport, 12);
    assert.ok(privateEdges.some(edge => edge.source === 'src/app/dynamic.ts' && edge.kind === 'runtime'));
    assert.ok(privateEdges.some(edge => edge.source === 'src/app/import-type.ts' && edge.kind === 'type'));
    assert.ok(privateEdges.some(edge => edge.source === 'src/app/type-reexport.ts' && edge.kind === 'type'));
    assert.ok(privateEdges.some(edge => edge.source === 'src/app/query.ts' && edge.kind === 'runtime'));
    assert.ok(privateEdges.some(edge => edge.source === 'src/app/bypass.js' && edge.kind === 'runtime'));
    assert.ok(privateEdges.some(edge => edge.source === 'src/app/glob.ts'
      && edge.target === 'src/modules/alpha/internal.ts' && edge.kind === 'runtime'));
    assert.ok(!privateEdges.some(edge => edge.source === 'src/app/negative-glob.ts'));
    assert.ok(privateEdges.some(edge => edge.source === 'src/app/styles.css'
      && edge.target === 'src/modules/alpha/theme.css' && edge.kind === 'runtime'));
    assert.ok(privateEdges.some(edge => edge.source === 'src/app/leak.d.ts' && edge.kind === 'type'));
    assert.ok(privateEdges.some(edge => edge.target === 'src/modules/alpha/theme.css'));
    assert.ok(privateEdges.every(edge => edge.target.startsWith('src/modules/alpha/')));
    assert.ok(!privateEdges.some(edge => edge.source === 'src/modules/beta/public.ts'));
    assert.match(
      formatModuleBoundaryReport(report),
      /src\/app\/static\.ts -> src\/modules\/alpha\/internal\.ts \(runtime\)/,
    );
  } finally {
    cleanup(root);
  }
});

test('allows a module stylesheet only through its declared public style entry', () => {
  const alpha = {
    ...moduleEntry('client.alpha', 'client', 'src/modules/alpha'),
    publicStyleEntry: 'src/modules/alpha/public.css',
  };
  const root = fixture(baseConfig([alpha]));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export const alpha = true;\n');
    writeFixture(root, 'src/modules/alpha/public.css', '@import "./internal.css";\n');
    writeFixture(root, 'src/modules/alpha/internal.css', '.alpha {}\n');
    writeFixture(root, 'src/index.css', '@import "./modules/alpha/public.css";\n');

    const publicReport = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.equal(publicReport.ok, true, formatModuleBoundaryReport(publicReport));
    assert.equal(publicReport.counts.internalImport, 0);

    writeFixture(root, 'src/index.css', '@import "./modules/alpha/internal.css";\n');
    const internalReport = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.equal(internalReport.counts.internalImport, 1);
    assert.ok(internalReport.errors.some(error => error.code === 'unapproved-boundary'));
  } finally {
    cleanup(root);
  }
});

test('excludes package imports when node_modules is stored inside the repository', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const root = fixture(baseConfig([alpha]));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', "import type { PackageType } from 'fixture-package'; export type Alpha = PackageType;\n");
    writeFixture(root, 'node_modules/fixture-package/package.json', JSON.stringify({
      name: 'fixture-package',
      version: '1.0.0',
      types: 'index.d.ts',
    }));
    writeFixture(root, 'node_modules/fixture-package/index.d.ts', 'export type PackageType = string;\n');

    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });

    assert.equal(report.ok, true, formatModuleBoundaryReport(report));
    assert.ok(!report.edges.some(edge => edge.target.includes('node_modules')));
  } finally {
    cleanup(root);
  }
});

test('reports module-to-legacy, undeclared module dependencies, runtime crossing, and shared back-dependencies', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const beta = moduleEntry('client.beta', 'client', 'src/modules/beta');
  const server = moduleEntry('server.gamma', 'server', 'server/modules/gamma');
  const root = fixture(baseConfig([alpha, beta, server]));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', "export { beta } from '../beta/public.js'; export { legacy } from '../../legacy.js';\n");
    writeFixture(root, 'src/modules/beta/public.ts', 'export const beta = 1;\n');
    writeFixture(root, 'src/legacy.ts', 'export const legacy = 1;\n');
    writeFixture(root, 'server/modules/gamma/public.ts', "export { beta } from '../../../src/modules/beta/public.js';\n");
    writeFixture(root, 'src/shared/platform.ts', "export { beta } from '../modules/beta/public.js';\n");

    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });

    assert.equal(report.counts.moduleLegacyImport, 1);
    assert.equal(report.counts.runtimeCrossing, 1);
    assert.ok(report.errors.some(error => error.code === 'undeclared-module-dependency'));
    assert.ok(report.errors.some(error => error.code === 'cross-runtime-import'));
    assert.ok(report.errors.some(error => error.code === 'shared-back-dependency'));
  } finally {
    cleanup(root);
  }
});

test('rejects runtime cycles and describes type-inclusive cycles exactly', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha', ['client.beta']);
  const beta = moduleEntry('client.beta', 'client', 'src/modules/beta', ['client.alpha']);
  const root = fixture(baseConfig([alpha, beta]));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', "export type { Beta } from '../beta/public.js'; export type Alpha = string;\n");
    writeFixture(root, 'src/modules/beta/public.ts', "export type { Alpha } from '../alpha/public.js'; export type Beta = string;\n");

    const typeReport = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.equal(typeReport.counts.typeCycle, 1);
    assert.equal(typeReport.cycles.runtime.length, 0);
    assert.deepEqual(typeReport.cycles.typeInclusive, [{
      source: 'src/modules/alpha/public.ts',
      target: 'src/modules/beta/public.ts',
      kind: 'type-cycle',
      nodes: [
        'src/modules/alpha/public.ts',
        'src/modules/beta/public.ts',
      ],
      edges: [{
        source: 'src/modules/alpha/public.ts',
        target: 'src/modules/beta/public.ts',
        kind: 'type',
      }, {
        source: 'src/modules/beta/public.ts',
        target: 'src/modules/alpha/public.ts',
        kind: 'type',
      }],
    }]);

    writeFixture(root, 'src/modules/alpha/public.ts', "export { beta } from '../beta/public.js'; export const alpha = 1;\n");
    writeFixture(root, 'src/modules/beta/public.ts', "export { alpha } from '../alpha/public.js'; export const beta = 1;\n");
    const runtimeReport = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.deepEqual(runtimeReport.cycles.runtime, [{
      source: 'src/modules/alpha/public.ts',
      target: 'src/modules/beta/public.ts',
      kind: 'runtime-cycle',
      nodes: [
        'src/modules/alpha/public.ts',
        'src/modules/beta/public.ts',
      ],
      edges: [{
        source: 'src/modules/alpha/public.ts',
        target: 'src/modules/beta/public.ts',
        kind: 'runtime',
      }, {
        source: 'src/modules/beta/public.ts',
        target: 'src/modules/alpha/public.ts',
        kind: 'runtime',
      }],
    }]);
    assert.ok(runtimeReport.errors.some(error => error.code === 'runtime-cycle'));
  } finally {
    cleanup(root);
  }
});

test('requires exact, live, unexpired exceptions and ratcheted budgets', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const exception = {
    source: 'src/modules/alpha',
    target: 'src/modules/alpha/public.ts',
    kind: 'missing-public-entry',
    owner: 'architecture-test',
    reason: 'Fixture migration baseline',
    expiresOn: '2026-12-31',
  };
  const config = baseConfig([alpha], {
    allowlistBudgets: {
      missingPublicEntry: 1,
      internalImport: 0,
      moduleLegacyImport: 0,
      runtimeCrossing: 0,
      typeCycle: 0,
    },
    exceptions: {
      missingPublicEntry: [exception],
      internalImport: [],
      moduleLegacyImport: [],
      runtimeCrossing: [],
      typeCycle: [],
    },
  });
  const root = fixture(config);
  try {
    mkdirSync(join(root, 'src/modules/alpha'), { recursive: true });
    const allowed = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.equal(allowed.ok, true, JSON.stringify(allowed.errors));

    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    const stale = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(stale.errors.some(error => error.code === 'stale-exception'));

    rmSync(join(root, 'src/modules/alpha/public.ts'));
    const expiredConfig = { ...config, exceptions: { ...config.exceptions, missingPublicEntry: [{ ...exception, expiresOn: '2026-08-16' }] } };
    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify(expiredConfig, null, 2)}\n`);
    const expired = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(expired.errors.some(error => error.code === 'expired-exception'));

    const floatingBudget = { ...config, allowlistBudgets: { ...config.allowlistBudgets, missingPublicEntry: 2 } };
    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify(floatingBudget, null, 2)}\n`);
    const unratcheted = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(unratcheted.errors.some(error => error.code === 'exception-budget-mismatch'));

    const invalidDate = {
      ...config,
      exceptions: {
        ...config.exceptions,
        missingPublicEntry: [{ ...exception, expiresOn: '9999-99-99' }],
      },
    };
    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify(invalidDate, null, 2)}\n`);
    const invalidDateReport = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(invalidDateReport.errors.some(error => error.code === 'invalid-exception-metadata'));

    const distantExpiry = {
      ...config,
      exceptions: {
        ...config.exceptions,
        missingPublicEntry: [{ ...exception, expiresOn: '9999-12-31' }],
      },
    };
    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify(distantExpiry, null, 2)}\n`);
    const distantExpiryReport = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(distantExpiryReport.errors.some(error => error.code === 'exception-expiry-too-distant'));
  } finally {
    cleanup(root);
  }
});

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
  const root = fixture(baseConfig([alpha], {
    migrationAreas: [
      migrationAreaEntry('client.linkedRoot', 'client', ['src/root-link'], {
        safeStarts: ['src/root-link/entry.ts'],
      }),
      migrationAreaEntry('client.linkedStart', 'client', ['src/legacy'], {
        safeStarts: ['src/legacy/entry.ts'],
      }),
    ],
  }));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    writeFixture(root, 'src/root-target/entry.ts', 'export {};\n');
    symlinkSync('root-target', join(root, 'src/root-link'));
    writeFixture(root, 'src/legacy/real.ts', 'export {};\n');
    symlinkSync('real.ts', join(root, 'src/legacy/entry.ts'));

    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });

    assert.ok(report.errors.some(error => (
      error.code === 'unsafe-migration-root'
        && error.message.includes('src/root-link')
    )));
    assert.ok(report.errors.some(error => (
      error.code === 'missing-migration-artifact'
        && error.message.includes('src/legacy/entry.ts')
    )));
  } finally {
    cleanup(root);
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

test('valid JSON with a non-object root fails closed as a structured boundary report', () => {
  const root = fixture(baseConfig([]));
  try {
    writeFixture(root, 'config/module-boundaries.json', 'null\n');
    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.equal(report.ok, false);
    assert.ok(report.errors.some(error => error.code === 'invalid-config-shape'));
    assert.doesNotMatch(formatModuleBoundaryReport(report), /TypeError|\n\s+at /);
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

test('rejects inconsistent type-cycle metadata and source symlinks', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha', ['client.beta']);
  const beta = moduleEntry('client.beta', 'client', 'src/modules/beta', ['client.alpha']);
  const root = fixture(baseConfig([alpha, beta]));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', "export type { Beta } from '../beta/public.js'; export type Alpha = string;\n");
    writeFixture(root, 'src/modules/beta/public.ts', "export type { Alpha } from '../alpha/public.js'; export type Beta = string;\n");
    const discovered = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    const cycle = discovered.cycles.typeInclusive[0];
    const exception = {
      ...cycle,
      source: '../outside.ts',
      kind: 'runtime-cycle',
      owner: 'architecture-test',
      reason: 'Fixture migration baseline',
      expiresOn: '2026-12-31',
    };
    const config = baseConfig([alpha, beta], {
      allowlistBudgets: {
        missingPublicEntry: 0,
        internalImport: 0,
        moduleLegacyImport: 0,
        runtimeCrossing: 0,
        typeCycle: 1,
      },
      exceptions: {
        missingPublicEntry: [],
        internalImport: [],
        moduleLegacyImport: [],
        runtimeCrossing: [],
        typeCycle: [exception],
      },
    });
    writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify(config, null, 2)}\n`);
    symlinkSync('../modules/alpha/internal.ts', join(root, 'src/app-linked.ts'));

    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(report.errors.some(error => error.code === 'invalid-cycle-exception'));
    assert.ok(report.errors.some(error => error.code === 'unsafe-source-symlink'));
  } finally {
    cleanup(root);
  }
});

test('fails closed when import.meta.glob is dynamic or escapes the repository', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const root = fixture(baseConfig([alpha]));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    writeFixture(root, 'src/app/dynamic-glob.ts', "const pattern = '../modules/alpha/*.ts'; import.meta.glob(pattern);\n");
    writeFixture(root, 'src/app/escaping-glob.ts', "import.meta.glob('../../../outside/*.ts');\n");
    writeFixture(root, 'src/app/dynamic-import.ts', "const target = '../modules/alpha/internal.js'; void import(target);\n");
    writeFixture(root, 'src/app/dynamic-require.js', "const target = '../modules/alpha/internal.js'; require(target);\n");

    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(report.errors.some(error => error.code === 'dynamic-import-meta-glob'));
    assert.ok(report.errors.some(error => error.code === 'unsafe-import-meta-glob'));
    assert.ok(report.errors.some(error => error.code === 'dynamic-module-import'));
    assert.ok(report.errors.some(error => error.code === 'dynamic-require'));
  } finally {
    cleanup(root);
  }
});

test('fails closed when the TypeScript project configuration is missing or invalid', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const root = fixture(baseConfig([alpha]));
  try {
    writeFixture(root, 'src/modules/alpha/public.ts', 'export {};\n');
    writeFixture(root, 'tsconfig.json', '{ invalid json');
    const invalid = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(invalid.errors.some(error => error.code === 'invalid-tsconfig'));

    rmSync(join(root, 'tsconfig.json'));
    const missing = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.ok(missing.errors.some(error => error.code === 'missing-tsconfig'));
  } finally {
    cleanup(root);
  }
});
