import assert from 'node:assert/strict';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
} from '../scripts/lib/repository-path-policy.mjs';
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
