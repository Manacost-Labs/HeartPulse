import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { analyzeArchitecture } from '../scripts/architecture-baseline.mjs';
import { validateArchitectureDebt } from '../scripts/check-module-boundaries.mjs';

function writeFixture(repositoryRoot, relativePath, contents) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

test('reports the complete architecture safety baseline deterministically', () => {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), 'hearthpulse-architecture-baseline-'));
  try {
    writeFixture(repositoryRoot, 'src/App.tsx', [
      "import { runtimeA } from './runtime-a.js';",
      '// @ts-expect-error fixture suppression',
      'const unsafe: any = runtimeA;',
      "export async function App() { await fetch('/api/test');",
      "  return <main style={{ color: 'red' }}>{unsafe}</main>;",
      '}',
    ].join('\n'));
    writeFixture(repositoryRoot, 'src/runtime-a.ts', "import { runtimeB } from './runtime-b.js';\nexport const runtimeA = runtimeB + 1;\n");
    writeFixture(repositoryRoot, 'src/runtime-b.ts', "import { runtimeA } from './runtime-a.js';\nexport const runtimeB = runtimeA + 1;\n");
    writeFixture(repositoryRoot, 'src/type-a.ts', "import type { TypeB } from './type-b.js';\nexport type TypeA = TypeB;\n");
    writeFixture(repositoryRoot, 'src/type-b.ts', "import type { TypeA } from './type-a.js';\nexport type TypeB = TypeA;\n");
    writeFixture(repositoryRoot, 'src/modules/alpha/view.ts', "import { privateBeta } from '../beta/private.js';\nexport const alpha = privateBeta;\n");
    writeFixture(repositoryRoot, 'src/modules/beta/private.ts', 'export const privateBeta = 1;\n');
    writeFixture(repositoryRoot, 'src/styles/main.css', '.fixture { color: red !important; }\n');
    writeFixture(repositoryRoot, 'shared/platform.ts', "import express from 'express';\nexport const platform = express;\n");
    writeFixture(repositoryRoot, 'tests/sample.test.ts', 'export {};\n');
    writeFixture(repositoryRoot, 'tests/test-suites.json', JSON.stringify({
      version: 1,
      suites: [
        { id: 'unit', files: ['tests/sample.test.ts'] },
        { id: 'integration', files: [] },
        { id: 'contract', files: [] },
        { id: 'browser', files: [] },
        { id: 'production-smoke', files: [] },
      ],
      exclusions: [],
      fileEnvironment: {},
    }));
    writeFixture(repositoryRoot, 'dist/index.html', '<script type="module" src="/assets/index-fixture.js"></script>');
    writeFixture(repositoryRoot, 'dist/assets/index-fixture.js', '123456');
    writeFixture(repositoryRoot, 'dist/assets/vendor-fixture.js', '1234');
    writeFixture(repositoryRoot, 'dist/assets/index-fixture.css', '12');

    const baseline = analyzeArchitecture(repositoryRoot, {
      largeCodeLines: 3,
      largeStyleLines: 1,
    });

    assert.equal(baseline.schemaVersion, 1);
    assert.equal(baseline.source.productFiles, 9);
    assert.equal(baseline.source.rawFetch.calls, 1);
    assert.deepEqual(baseline.source.rawFetch.files, ['src/App.tsx']);
    assert.equal(baseline.source.inlineStyles.count, 1);
    assert.equal(baseline.source.cssImportant.count, 1);
    assert.equal(baseline.source.typeScriptSuppressions.count, 1);
    assert.equal(baseline.source.explicitAny.count, 1);
    assert.ok(baseline.source.largeFiles.some(entry => entry.file === 'src/App.tsx'));
    assert.deepEqual(baseline.dependencies.runtimeCycles, [
      ['src/runtime-a.ts', 'src/runtime-b.ts'],
    ]);
    assert.deepEqual(baseline.dependencies.typeOnlyCycles, [
      ['src/type-a.ts', 'src/type-b.ts'],
    ]);
    assert.deepEqual(
      baseline.dependencies.boundaryViolations.map(entry => entry.rule),
      ['cross-module-internal-import', 'root-shared-platform-import'],
    );
    assert.deepEqual(baseline.tests, {
      discovered: 1,
      registered: 1,
      excluded: 0,
      unclassified: 0,
      notExecuted: 0,
    });
    assert.equal(baseline.bundle.available, true);
    assert.equal(baseline.bundle.assetCount, 3);
    assert.equal(baseline.bundle.rawBytes, 12);
    assert.deepEqual(
      baseline.bundle.largestAssets.map(entry => entry.file),
      ['dist/assets/index-fixture.js', 'dist/assets/vendor-fixture.js', 'dist/assets/index-fixture.css'],
    );
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test('module boundary gate blocks runtime cycles and unclassified dependency debt', () => {
  const baseline = {
    dependencies: {
      boundaryViolations: [{
        rule: 'cross-module-internal-import',
        file: 'src/modules/alpha/view.ts',
        import: '../beta/private.js',
        target: 'src/modules/beta/private.ts',
      }],
      runtimeCycles: [['src/runtime-a.ts', 'src/runtime-b.ts']],
      typeOnlyCycles: [['src/type-a.ts', 'src/type-b.ts']],
    },
  };
  const registry = {
    version: 1,
    boundaryViolations: [{
      rule: 'cross-module-internal-import',
      file: 'src/modules/alpha/view.ts',
      import: '../beta/private.js',
      target: 'src/modules/beta/private.ts',
      owner: 'fixture-alpha',
      reason: 'Fixture debt proves exact exception matching.',
      removal: 'Expose a public beta contract.',
    }],
    typeOnlyCycles: [{
      files: ['src/type-a.ts', 'src/type-b.ts'],
      owner: 'fixture-types',
      reason: 'Fixture debt proves type-only classification.',
      removal: 'Move the shared type to an acyclic owner.',
    }],
  };

  assert.throws(
    () => validateArchitectureDebt(baseline, registry),
    /runtime import cycles are forbidden/,
  );

  const withoutRuntimeCycle = {
    dependencies: { ...baseline.dependencies, runtimeCycles: [] },
  };
  assert.deepEqual(validateArchitectureDebt(withoutRuntimeCycle, registry), {
    boundaryExceptions: 1,
    runtimeCycles: 0,
    typeOnlyCycleExceptions: 1,
  });

  assert.throws(
    () => validateArchitectureDebt({
      dependencies: {
        ...withoutRuntimeCycle.dependencies,
        boundaryViolations: [
          ...withoutRuntimeCycle.dependencies.boundaryViolations,
          {
            rule: 'client-to-server-import',
            file: 'src/new.ts',
            import: '../server/private.js',
            target: 'server/private.ts',
          },
        ],
      },
    }, registry),
    /unclassified boundary violations/,
  );

  assert.throws(
    () => validateArchitectureDebt({
      dependencies: { ...withoutRuntimeCycle.dependencies, typeOnlyCycles: [] },
    }, registry),
    /stale type-only cycle exceptions/,
  );
});
