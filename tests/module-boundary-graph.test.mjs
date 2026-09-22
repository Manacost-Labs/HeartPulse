import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  analyzeModuleBoundaries,
  formatModuleBoundaryReport,
} from '../scripts/check-module-boundaries.mjs';
import {
  compareEdges,
  cycleKey,
  edgeKey,
} from '../scripts/lib/module-boundary-edges.mjs';
import {
  walkOwnershipFiles,
  walkSourceFiles,
} from '../scripts/lib/module-boundary-source-scan.mjs';
import {
  NOW,
  baseConfig,
  cleanup,
  fixture,
  moduleEntry,
  writeFixture,
} from './support/module-boundary-fixture.mjs';

test('edge identities and ordering stay stable without mutating cycle inputs', () => {
  const edges = [
    { source: 'b.ts', target: 'a.ts', kind: 'runtime' },
    { source: 'a.ts', target: 'c.ts', kind: 'type' },
    { source: 'a.ts', target: 'b.ts', kind: 'runtime' },
  ];
  assert.deepEqual([...edges].sort(compareEdges).map(edgeKey), [
    'a.ts\0b.ts\0runtime',
    'a.ts\0c.ts\0type',
    'b.ts\0a.ts\0runtime',
  ]);

  const cycle = {
    nodes: ['b.ts', 'a.ts'],
    edges: [edges[0], edges[2]],
  };
  const original = structuredClone(cycle);
  assert.equal(cycleKey(cycle), cycleKey({
    nodes: ['a.ts', 'b.ts'],
    edges: [edges[2], edges[0]],
  }));
  assert.deepEqual(cycle, original);
});

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
