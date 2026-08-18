import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import * as boundaryModule from '../scripts/check-module-boundaries.mjs';
import {
  CANONICAL_MODULE_ROOTS,
  CANONICAL_SHARED_ROOTS,
  MODULE_EXCEPTION_GROUPS,
} from '../scripts/lib/module-boundary-contracts.mjs';
import {
  NOW,
  baseConfig,
  cleanup,
  fixture,
  moduleEntry,
  writeFixture,
} from './support/module-boundary-fixture.mjs';

const {
  analyzeModuleBoundaries,
  formatModuleBoundaryReport,
  validateModuleInventoryMetadata,
} = boundaryModule;
const CHECKER_URL = new URL('../scripts/check-module-boundaries.mjs', import.meta.url);

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

test('boundary checker CLI rejects missing option values before analysis', () => {
  const root = fixture(baseConfig([]));
  try {
    const cases = [
      { args: ['--root'], option: '--root' },
      { args: ['--config'], option: '--config' },
      { args: ['--root', ''], option: '--root' },
      { args: ['--root', '   '], option: '--root' },
      { args: ['--config', ''], option: '--config' },
      { args: ['--config', '   '], option: '--config' },
      { args: ['--root', '--config', 'config/module-boundaries.json'], option: '--root' },
      { args: ['--config', '--root', root], option: '--config' },
    ];

    const actual = cases.map(fixtureCase => {
      const result = spawnSync(process.execPath, [CHECKER_URL.pathname, ...fixtureCase.args], {
        cwd: root,
        encoding: 'utf8',
        timeout: 30_000,
      });
      return { status: result.status, stdout: result.stdout, stderr: result.stderr };
    });
    assert.deepEqual(actual, cases.map(fixtureCase => ({
      status: 2,
      stdout: '',
      stderr: `Missing value for argument: ${fixtureCase.option}\n`,
    })));
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

test('canonical boundary contracts cannot be mutated to weaken validation', () => {
  assert.throws(() => CANONICAL_MODULE_ROOTS.splice(0), TypeError);
  assert.throws(() => CANONICAL_SHARED_ROOTS.splice(0), TypeError);
  assert.throws(() => {
    CANONICAL_SHARED_ROOTS[0].root = 'src/disabled';
  }, TypeError);
  assert.throws(() => MODULE_EXCEPTION_GROUPS.splice(0), TypeError);

  const metadata = validateModuleInventoryMetadata({
    config: baseConfig([], { moduleRoots: [] }),
    now: NOW,
  });
  assert.ok(metadata.errors.some(error => error.code === 'invalid-boundary-roots'));

  const alpha = moduleEntry('client.alpha', 'client', 'src/modules/alpha');
  const root = fixture(baseConfig([alpha]));
  try {
    writeFixture(root, 'src/modules/alpha/source.ts', 'export {};\n');
    const report = analyzeModuleBoundaries({ rootDir: root, now: NOW });
    assert.equal(report.counts.missingPublicEntry, 1);
    assert.ok(report.errors.some(error => error.code === 'unapproved-boundary'));
  } finally {
    cleanup(root);
  }
});
