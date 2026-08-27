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
      physicalModuleDirectories: 1,
    });
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
  assert.equal(summary.physicalModuleDirectories, summary.modules);

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
