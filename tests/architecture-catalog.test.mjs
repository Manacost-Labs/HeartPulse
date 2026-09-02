import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

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
    ['legacy-frontend-articles'],
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
