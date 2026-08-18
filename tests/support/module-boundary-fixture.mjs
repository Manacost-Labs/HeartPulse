import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const NOW = new Date('2026-08-17T00:00:00.000Z');

export function writeFixture(root, path, contents = '') {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

export function moduleEntry(id, runtime, root, dependencies = []) {
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

export function migrationAreaEntry(id, runtime, roots, overrides = {}) {
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

export function sharedRootEntry(id, runtime, root, overrides = {}) {
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

export function baseConfig(modules, overrides = {}) {
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

export function fixture(config) {
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

export function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}
