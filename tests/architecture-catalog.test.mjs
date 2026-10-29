import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { analyzeModuleBoundaries } from '../scripts/check-module-boundaries.mjs';
import { selectAffectedTests } from '../scripts/lib/ci-affected-tests.mjs';
import { buildEdges, readCompilerOptions } from '../scripts/lib/module-import-graph.mjs';

import {
  findModuleForFile,
  findRouteOwners,
  validateArchitectureCatalog,
} from '../scripts/architecture-catalog.mjs';

function writeFixture(repositoryRoot, relativePath, contents = '') {
  const absolutePath = path.join(repositoryRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function fixtureCatalog() {
  return {
    version: 1,
    modules: [{
      name: 'frontend-example',
      status: 'modular',
      owner: 'example-team',
      purpose: 'Own the example route.',
      paths: ['src/modules/example'],
      publicEntrypoints: ['src/modules/example/public.ts'],
      frontendRoutes: ['/example/:id'],
      backendRoutes: [{ method: 'GET', path: '/api/example/:id' }],
      contracts: ['src/modules/example/schema.ts'],
      jobs: [],
      cacheNamespaces: [],
      dataStores: [],
      externalServices: [],
      tests: ['tests/example.test.ts'],
      allowedDependencies: ['shared'],
      forbiddenImports: ['server/**', 'src/modules/*/internal/**'],
    }],
  };
}

function fixtureLegacyArea(overrides = {}) {
  return {
    name: 'legacy-frontend-page',
    status: 'legacy',
    owner: 'legacy-team',
    purpose: 'Own a legacy page while it is extracted behind a module boundary.',
    paths: ['src/features/LegacyPage.tsx'],
    publicEntrypoints: ['src/features/LegacyPage.tsx'],
    frontendRoutes: ['/legacy/:id'],
    backendRoutes: [{ method: 'GET', path: '/api/legacy/:id' }],
    contracts: [],
    jobs: [],
    cacheNamespaces: [],
    dataStores: [],
    externalServices: [],
    tests: ['tests/legacy-page.test.ts'],
    allowedDependencies: ['legacy host dependencies during migration'],
    forbiddenImports: ['new cross-domain dependencies'],
    migrationTarget: 'frontend-legacy-page',
    exitCriteria: 'The route is served by the target module public entrypoint.',
    ...overrides,
  };
}

test('architecture catalog validates module ownership and covers physical module directories', () => {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), 'hearthpulse-catalog-'));
  try {
    writeFixture(repositoryRoot, 'src/modules/example/public.ts', 'export {};\n');
    writeFixture(repositoryRoot, 'src/modules/example/schema.ts', 'export {};\n');
    writeFixture(repositoryRoot, 'tests/example.test.ts', 'export {};\n');

    assert.deepEqual(validateArchitectureCatalog(fixtureCatalog(), repositoryRoot), {
      modules: 1,
      modular: 1,
      transitional: 0,
      legacy: 0,
      physicalModuleDirectories: 1,
    });
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test('architecture catalog validates and resolves legacy file and route ownership', () => {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), 'hearthpulse-legacy-catalog-'));
  try {
    writeFixture(repositoryRoot, 'src/modules/example/public.ts', 'export {};\n');
    writeFixture(repositoryRoot, 'src/modules/example/schema.ts', 'export {};\n');
    writeFixture(repositoryRoot, 'src/features/LegacyPage.tsx', 'export {};\n');
    writeFixture(repositoryRoot, 'tests/example.test.ts', 'export {};\n');
    writeFixture(repositoryRoot, 'tests/legacy-page.test.ts', 'export {};\n');
    const catalog = {
      ...fixtureCatalog(),
      legacyAreas: [fixtureLegacyArea()],
    };

    assert.deepEqual(validateArchitectureCatalog(catalog, repositoryRoot), {
      modules: 1,
      modular: 1,
      transitional: 0,
      legacy: 1,
      physicalModuleDirectories: 1,
    });
    assert.equal(
      findModuleForFile(catalog, 'src/features/LegacyPage.tsx')?.name,
      'legacy-frontend-page',
    );
    assert.deepEqual(
      findRouteOwners(catalog, 'FRONTEND', '/legacy/42').map(entry => entry.name),
      ['legacy-frontend-page'],
    );
    assert.deepEqual(
      findRouteOwners(catalog, 'GET', '/api/legacy/42').map(entry => entry.name),
      ['legacy-frontend-page'],
    );
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test('architecture catalog rejects incomplete legacy records', () => {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), 'hearthpulse-legacy-catalog-'));
  try {
    writeFixture(repositoryRoot, 'src/modules/example/public.ts', 'export {};\n');
    writeFixture(repositoryRoot, 'src/modules/example/schema.ts', 'export {};\n');
    writeFixture(repositoryRoot, 'src/features/LegacyPage.tsx', 'export {};\n');
    writeFixture(repositoryRoot, 'tests/example.test.ts', 'export {};\n');
    writeFixture(repositoryRoot, 'tests/legacy-page.test.ts', 'export {};\n');
    const catalog = {
      ...fixtureCatalog(),
      legacyAreas: [fixtureLegacyArea({ migrationTarget: '' })],
    };

    assert.throws(
      () => validateArchitectureCatalog(catalog, repositoryRoot),
      /legacy-frontend-page\.migrationTarget must be a non-empty string/,
    );
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test('architecture catalog rejects overlapping paths and duplicate route owners', () => {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), 'hearthpulse-legacy-catalog-'));
  try {
    writeFixture(repositoryRoot, 'src/modules/example/public.ts', 'export {};\n');
    writeFixture(repositoryRoot, 'src/modules/example/schema.ts', 'export {};\n');
    writeFixture(repositoryRoot, 'tests/example.test.ts', 'export {};\n');
    writeFixture(repositoryRoot, 'tests/legacy-page.test.ts', 'export {};\n');

    assert.throws(
      () => validateArchitectureCatalog({
        ...fixtureCatalog(),
        legacyAreas: [fixtureLegacyArea({
          paths: ['src/modules/example'],
          publicEntrypoints: ['src/modules/example/public.ts'],
        })],
      }, repositoryRoot),
      /overlapping architecture paths/,
    );

    assert.throws(
      () => validateArchitectureCatalog({
        ...fixtureCatalog(),
        legacyAreas: [fixtureLegacyArea({
          paths: [],
          publicEntrypoints: ['src/modules/example/public.ts'],
          frontendRoutes: ['/example/:slug'],
          backendRoutes: [],
        })],
      }, repositoryRoot),
      /duplicate frontend route owner/,
    );

    assert.throws(
      () => validateArchitectureCatalog({
        ...fixtureCatalog(),
        legacyAreas: [fixtureLegacyArea({
          paths: [],
          publicEntrypoints: ['src/modules/example/public.ts'],
          frontendRoutes: [],
          backendRoutes: [{ method: 'GET', path: '/api/example/:slug' }],
        })],
      }, repositoryRoot),
      /duplicate backend route owner/,
    );
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test('architecture catalog resolves a source file and parameterized routes', () => {
  const catalog = fixtureCatalog();
  assert.equal(
    findModuleForFile(catalog, 'src/modules/example/ui/ExamplePage.tsx')?.name,
    'frontend-example',
  );
  assert.deepEqual(
    findRouteOwners(catalog, 'GET', '/api/example/42').map(module => module.name),
    ['frontend-example'],
  );
  assert.deepEqual(
    findRouteOwners(catalog, 'FRONTEND', '/example/42').map(module => module.name),
    ['frontend-example'],
  );
});

test('repository catalog is valid and covers every current module directory', () => {
  const catalog = JSON.parse(readFileSync('config/architecture-catalog.json', 'utf8'));
  const summary = validateArchitectureCatalog(catalog, process.cwd());
  assert.ok(summary.modules >= 10);
  assert.ok(summary.legacy >= 5);
  assert.equal(summary.physicalModuleDirectories, summary.modules);

  assert.equal(findModuleForFile(catalog, 'server/index.ts')?.name, 'legacy-server-composition');
  assert.equal(
    findModuleForFile(catalog, 'src/features/DeferredRoutes.tsx')?.name,
    'legacy-frontend-deferred-routes-host',
  );
  assert.deepEqual(
    findRouteOwners(catalog, 'FRONTEND', '/articles').map(entry => entry.name),
    ['frontend-articles'],
  );
  assert.deepEqual(
    findRouteOwners(catalog, 'FRONTEND', '/heroes/123').map(entry => entry.name),
    ['legacy-frontend-battlegrounds-data'],
  );

  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const readme = readFileSync('README.md', 'utf8');
  for (const command of [
    'architecture:map',
    'architecture:owner',
    'architecture:impact',
    'architecture:module',
    'architecture:dependencies',
    'architecture:tests',
    'test:module',
  ]) {
    assert.equal(typeof packageJson.scripts[command], 'string', `${command} script must exist`);
    if (['architecture:map', 'architecture:owner', 'architecture:impact', 'test:module'].includes(command)) {
      assert.match(readme, new RegExp(command.replace(':', '\\:')));
    }
  }
});

// ---------------------------------------------------------------------------
// Guard for the affected-tests selection (`scripts/lib/ci-affected-tests.mjs`).
//
// The selection takes the tests listed in this catalog for the module or legacy
// area that owns a changed file. It does not follow imports from legacy code, so
// a registered test that reaches a file only through another area would be
// skipped unless the catalog lists it. These tests run on the real configs and
// the real import graph and fail as soon as the catalog drifts from the code.
//
// Guarded roots: grow this list when a later slice describes more code (`src`,
// `apps`); the matching module and legacy-area `tests` must be complete first.
// ---------------------------------------------------------------------------
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARDED_ROOTS = ['server'];
// The module graph sees only src, server and shared. These roots add the
// importers it misses (registered tests and their helpers, scripts, apps); a
// later slice extends the list when it needs another importer root.
const IMPORTER_ROOTS = ['tests', 'scripts', 'apps'];
const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;

function readRepositoryJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));
}

function sourceFilesUnder(relativeRoot) {
  const found = [];
  const visit = relativeDirectory => {
    const entries = readdirSync(path.join(repositoryRoot, relativeDirectory), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) visit(relativePath);
      else if (SOURCE_FILE.test(entry.name)) found.push(relativePath);
    }
  };
  visit(relativeRoot);
  return found.sort();
}

function loadSelectionInputs() {
  const importGraph = analyzeModuleBoundaries({ rootDir: repositoryRoot });
  assert.ok(importGraph.ok, 'the repository import graph must be valid');
  const registry = readRepositoryJson('tests/test-suites.json');
  const outsideGraph = IMPORTER_ROOTS
    .flatMap(sourceFilesUnder)
    .map(file => path.join(repositoryRoot, file));
  const outside = buildEdges(repositoryRoot, outsideGraph, readCompilerOptions(repositoryRoot));
  const imports = new Map();
  for (const edge of [...importGraph.edges, ...outside.edges]) {
    if (!imports.has(edge.source)) imports.set(edge.source, []);
    imports.get(edge.source).push(edge.target);
  }
  const reachableFrom = start => {
    const seen = new Set();
    const pending = [start];
    while (pending.length > 0) {
      for (const next of imports.get(pending.pop()) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          pending.push(next);
        }
      }
    }
    return seen;
  };
  const registeredTests = registry.suites.flatMap(suite => suite.files);
  const reachedByTest = new Map(registeredTests.map(file => [file, reachableFrom(file)]));
  return {
    edges: importGraph.edges,
    registry,
    inventory: readRepositoryJson('config/module-boundaries.json'),
    catalog: readRepositoryJson('config/architecture-catalog.json'),
    testsImporting: file => registeredTests.filter(testFile => reachedByTest.get(testFile).has(file)),
  };
}

function selectedFiles(selection) {
  return new Set(Object.values(selection.files).flat());
}

test('affected-tests selection for a legacy server file includes the tests that import it', () => {
  const inputs = loadSelectionInputs();
  const selection = selectAffectedTests({ ...inputs, changedFiles: ['server/adminRemoteImage.ts'] });

  assert.equal(selection.mode, 'subset');
  assert.ok(inputs.testsImporting('server/adminRemoteImage.ts').includes('tests/admin-remote-image.test.ts'));
  assert.ok(selectedFiles(selection).has('tests/admin-remote-image.test.ts'));
  assert.ok(selectedFiles(selection).has('tests/architecture-catalog.test.mjs'));
  // A narrow selection is the point of describing legacy code in the catalog.
  assert.ok(selectedFiles(selection).size < 20, `selected ${selectedFiles(selection).size} test files`);
});

test('affected-tests selection never skips a registered test that imports a changed guarded file', () => {
  const inputs = loadSelectionInputs();
  const guardedFiles = GUARDED_ROOTS.flatMap(sourceFilesUnder);
  let narrowed = 0;
  const skipped = [];

  for (const file of guardedFiles) {
    const selection = selectAffectedTests({ ...inputs, changedFiles: [file] });
    if (selection.mode === 'all') continue;
    narrowed += 1;
    const selected = selectedFiles(selection);
    const missing = inputs.testsImporting(file).filter(testFile => !selected.has(testFile));
    if (missing.length > 0) skipped.push(`${file}: ${missing.join(', ')}`);
  }

  assert.deepEqual(
    skipped,
    [],
    'list these tests in the catalog entry that owns the changed file',
  );
  assert.ok(narrowed > 100, `only ${narrowed} guarded files were narrowed; the catalog lost its coverage`);
});
