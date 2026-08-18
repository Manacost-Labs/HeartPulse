import assert from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { analyzeModuleBoundaries } from '../scripts/check-module-boundaries.mjs';
import {
  NOW,
  baseConfig,
  cleanup,
  fixture,
  moduleEntry,
  writeFixture,
} from './support/module-boundary-fixture.mjs';

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
