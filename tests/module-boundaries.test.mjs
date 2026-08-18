import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  analyzeModuleBoundaries,
  formatModuleBoundaryReport,
} from '../scripts/check-module-boundaries.mjs';

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

function baseConfig(modules, overrides = {}) {
  return {
    schemaVersion: 1,
    moduleRoots: ['src/modules', 'server/modules'],
    sharedRoots: { client: ['src/shared'], server: ['server/shared'] },
    modules,
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
  writeFixture(root, 'config/module-boundaries.json', `${JSON.stringify(config, null, 2)}\n`);
  return root;
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

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
    assert.deepEqual(typeReport.cycles.typeInclusive[0].nodes, [
      'src/modules/alpha/public.ts',
      'src/modules/beta/public.ts',
    ]);
    assert.ok(typeReport.cycles.typeInclusive[0].edges.every(edge => edge.kind === 'type'));

    writeFixture(root, 'src/modules/alpha/public.ts', "export { beta } from '../beta/public.js'; export const alpha = 1;\n");
    writeFixture(root, 'src/modules/beta/public.ts', "export { alpha } from '../alpha/public.js'; export const beta = 1;\n");
    const runtimeReport = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.equal(runtimeReport.cycles.runtime.length, 1);
    assert.equal(runtimeReport.cycles.runtime[0].kind, 'runtime-cycle');
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

test('requires canonical module and shared roots so configuration cannot disable the gate', () => {
  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const root = fixture(baseConfig([alpha], {
    moduleRoots: [],
    sharedRoots: { client: ['src'], server: ['server/shared'] },
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
