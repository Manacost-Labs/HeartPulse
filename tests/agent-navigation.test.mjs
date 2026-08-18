import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createAgentMap,
  formatAgentMap,
  formatAgentMapJson,
  loadAgentMap,
  readPublicRouteInventory,
} from '../scripts/agent-map.mjs';
import { loadAgentCheckPlan } from '../scripts/agent-check.mjs';
import {
  readModuleInventory,
  resolveModuleOrPathSelector,
} from '../scripts/lib/module-inventory.mjs';
import { publicRoutesForScope } from '../scripts/lib/public-route-inventory.mjs';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const inventoryFixture = {
  schemaVersion: 2,
  sharedRoots: { client: ['src/shared'], server: ['server/shared'] },
  modules: [
    {
      id: 'server.beta',
      runtime: 'server',
      root: 'server/modules/beta',
      purpose: 'Owns beta behavior.',
      owner: 'beta-team',
      publicEntry: 'server/modules/beta/public.ts',
      dependencies: ['server.alpha'],
      focusedTests: ['npm run test:beta'],
      docs: ['docs/specs/beta.md'],
    },
    {
      id: 'server.alpha',
      runtime: 'server',
      root: 'server/modules/alpha',
      purpose: 'Owns alpha behavior.',
      owner: 'alpha-team',
      publicEntry: 'server/modules/alpha/public.ts',
      publicStyleEntry: 'server/modules/alpha/public.css',
      dependencies: [],
      focusedTests: ['npm run test:alpha'],
      docs: ['docs/specs/alpha.md'],
    },
  ],
  migrationAreas: [{
    id: 'server.applicationComposition',
    runtime: 'server',
    roots: ['server/index.ts'],
    excludeRoots: [],
    purpose: 'Composes the legacy server entrypoint while routes move into modules.',
    owner: 'web-platform',
    targetModules: ['server.beta'],
    focusedTests: ['npm run test:server-build'],
    docs: ['docs/architecture/module-boundaries.md'],
    safeStarts: ['server/index.ts'],
    routeScope: { mode: 'owners', owners: ['beta-team'] },
    knownDebt: ['The server entrypoint still owns legacy route composition.'],
  }],
  exceptions: {
    internalImport: [{
      source: 'server/modules/beta/service.ts',
      target: 'server/modules/alpha/internal.ts',
      kind: 'runtime',
      reason: 'Temporary fixture debt.',
      owner: 'architecture-test',
      expiresOn: '2026-12-31',
    }, {
      source: 'server/consumer.ts',
      target: 'server/modules/alpha/other-internal.ts',
      kind: 'type',
      reason: 'Second fixture debt.',
      owner: 'architecture-test',
      expiresOn: '2026-11-30',
    }],
  },
};

const graphFixture = {
  counts: {
    modules: 2,
    sources: 8,
    edges: 3,
    runtimeCycle: 0,
  },
  edges: [
    {
      source: 'server/modules/beta/service.ts',
      target: 'server/modules/alpha/public.ts',
      kind: 'runtime',
    },
    {
      source: 'server/index.ts',
      target: 'server/modules/beta/public.ts',
      kind: 'runtime',
    },
    {
      source: 'server/consumer.ts',
      target: 'server/modules/alpha/public.ts',
      kind: 'runtime',
    },
  ],
};

const routesFixture = {
  schemaVersion: 1,
  canonicalOrigin: 'https://arena.example',
  routes: [
    {
      id: 'beta',
      pattern: '/beta',
      kind: 'static',
      owner: 'beta-team',
      indexPolicy: 'index',
    },
    {
      id: 'home',
      pattern: '/',
      kind: 'static',
      owner: 'product-shell',
      indexPolicy: 'index',
    },
  ],
};

test('agent map deterministically derives dependencies, dependents, callers and route ownership', () => {
  const map = createAgentMap({
    inventory: inventoryFixture,
    graph: graphFixture,
    publicRouteInventory: routesFixture,
  });

  assert.equal(map.schemaVersion, 1);
  assert.equal(map.command, 'map');
  assert.equal(map.ok, true);
  assert.deepEqual(map.counts, {
    modules: 2,
    migrationAreas: 1,
    sharedRoots: 2,
    clientModules: 0,
    serverModules: 2,
    publicRoutes: 2,
    sources: 8,
    edges: 3,
    runtimeCycles: 0,
  });
  assert.deepEqual(map.modules.map(module => module.id), ['server.alpha', 'server.beta']);
  assert.deepEqual(map.sharedRoots, [
    { runtime: 'server', root: 'server/shared' },
    { runtime: 'client', root: 'src/shared' },
  ]);
  assert.deepEqual(map.modules[0].dependencies, []);
  assert.deepEqual(map.modules[0].dependents, ['server.beta']);
  assert.deepEqual(map.modules[0].callers, [
    { path: 'server/consumer.ts', moduleId: null },
    { path: 'server/modules/beta/service.ts', moduleId: 'server.beta' },
  ]);
  assert.deepEqual(map.modules[1].dependencies, ['server.alpha']);
  assert.deepEqual(map.modules[1].dependents, []);
  assert.deepEqual(map.modules[1].callers, [
    { path: 'server/index.ts', moduleId: null },
  ]);
  assert.deepEqual(map.publicRoutes.map(route => route.id), ['home', 'beta']);
  assert.deepEqual(map.migrationAreas, [{
    id: 'server.applicationComposition',
    runtime: 'server',
    roots: ['server/index.ts'],
    excludeRoots: [],
    purpose: 'Composes the legacy server entrypoint while routes move into modules.',
    owner: 'web-platform',
    targetModules: ['server.beta'],
    focusedTests: ['npm run test:server-build'],
    docs: ['docs/architecture/module-boundaries.md'],
    safeStarts: ['server/index.ts'],
    publicRoutes: [{
      id: 'beta',
      pattern: '/beta',
      kind: 'static',
      owner: 'beta-team',
      indexPolicy: 'index',
    }],
    knownDebt: ['The server entrypoint still owns legacy route composition.'],
  }]);

  const deterministicInventory = {
    ...inventoryFixture,
    migrationAreas: [{
      ...inventoryFixture.migrationAreas[0],
      roots: ['server/index.ts', 'server/bootstrap.ts'],
      excludeRoots: ['server/generated.ts', 'server/legacy-generated.ts'],
      targetModules: ['server.alpha', 'server.beta'],
      focusedTests: ['npm run test:alpha', 'npm run test:server-build'],
      docs: ['docs/architecture/module-boundaries.md', 'docs/specs/alpha.md'],
      safeStarts: ['server/bootstrap.ts', 'server/index.ts'],
      routeScope: { mode: 'owners', owners: ['beta-team', 'product-shell'] },
      knownDebt: [
        'The server entrypoint still owns legacy route composition.',
        'A second deterministic fixture debt item.',
      ],
    }, {
      id: 'server.guidesLegacy',
      runtime: 'server',
      roots: ['server/guides', 'server/editorial.ts'],
      excludeRoots: ['server/guides/generated', 'server/editorial.generated.ts'],
      purpose: 'Owns editorial server behavior awaiting a module.',
      owner: 'editorial',
      targetModules: ['server.beta', 'server.alpha'],
      focusedTests: ['npm run test:beta', 'npm run test:alpha'],
      docs: ['docs/specs/beta.md', 'docs/specs/alpha.md'],
      safeStarts: ['server/guides/sanitize.ts', 'server/editorial.ts'],
      routeScope: { mode: 'owners', owners: ['product-shell', 'beta-team'] },
      knownDebt: ['Editorial routes remain legacy.', 'Editorial storage remains legacy.'],
    }],
  };
  const deterministicMap = createAgentMap({
    inventory: deterministicInventory,
    graph: graphFixture,
    publicRouteInventory: routesFixture,
  });
  const shuffled = createAgentMap({
    inventory: {
      ...deterministicInventory,
      modules: [...deterministicInventory.modules].reverse(),
      migrationAreas: deterministicInventory.migrationAreas.map(area => ({
        ...area,
        roots: [...area.roots].reverse(),
        excludeRoots: [...area.excludeRoots].reverse(),
        targetModules: [...area.targetModules].reverse(),
        focusedTests: [...area.focusedTests].reverse(),
        docs: [...area.docs].reverse(),
        safeStarts: [...area.safeStarts].reverse(),
        knownDebt: [...area.knownDebt].reverse(),
        routeScope: {
          ...area.routeScope,
          owners: [...area.routeScope.owners].reverse(),
        },
      })).reverse(),
      exceptions: {
        internalImport: [...inventoryFixture.exceptions.internalImport]
          .reverse()
          .map(exception => Object.fromEntries(Object.entries(exception).reverse())),
      },
    },
    graph: {
      ...graphFixture,
      edges: [...graphFixture.edges].reverse(),
    },
    publicRouteInventory: {
      ...routesFixture,
      routes: [...routesFixture.routes].reverse(),
    },
  });
  assert.equal(JSON.stringify(shuffled), JSON.stringify(deterministicMap));
  assert.equal(formatAgentMapJson(shuffled), formatAgentMapJson(deterministicMap));
  assert.equal(formatAgentMapJson(map).endsWith('\n'), true);
  assert.equal(formatAgentMapJson(map).endsWith('\n\n'), false);
  assert.doesNotMatch(formatAgentMapJson(map), /\/home\/|\\\\/);
});

test('agent map text is concise but exposes both code and URL ownership', () => {
  const map = createAgentMap({
    inventory: inventoryFixture,
    graph: graphFixture,
    publicRouteInventory: routesFixture,
  });
  const output = formatAgentMap(map);

  assert.match(output, /Project map: 2 modules \(0 client, 2 server\), 2 public routes/);
  assert.match(output, /server\.alpha \[alpha-team\]/);
  assert.match(output, /dependents: server\.beta/);
  assert.match(output, /public style: server\/modules\/alpha\/public\.css/);
  assert.match(output, /focused tests: npm run test:alpha/);
  assert.match(output, /docs: docs\/specs\/alpha\.md/);
  assert.match(output, /known debt: .*Temporary fixture debt/);
  assert.match(output, /server\/modules\/beta\/service\.ts \[server\.beta\]/);
  assert.match(output, /\/beta \(beta\) \[beta-team\]/);
  assert.match(output, /Migration areas:/);
  assert.match(output, /Canonical shared roots:[\s\S]*src\/shared \[client\]/);
  assert.match(output, /server\.applicationComposition \[web-platform\]/);
  assert.match(output, /targets: server\.beta/);
  assert.match(output, /routes: \/beta \(beta\)/);
});

test('agent map hydrates route patterns only from the canonical route inventory', () => {
  assert.throws(
    () => createAgentMap({
      inventory: {
        ...inventoryFixture,
        migrationAreas: [{
          ...inventoryFixture.migrationAreas[0],
          routeScope: { mode: 'owners', owners: ['missing-owner'] },
        }],
      },
      graph: graphFixture,
      publicRouteInventory: routesFixture,
    }),
    /unknown public route owner.*missing-owner/i,
  );
});

test('production migration scopes conservatively include shell and global route impact', () => {
  const inventory = readModuleInventory(REPOSITORY_ROOT);
  const routes = readPublicRouteInventory(REPOSITORY_ROOT);
  const featureArea = inventory.migrationAreas.find(area => area.id === 'client.featureLegacy');
  const platformArea = inventory.migrationAreas.find(area => area.id === 'client.platformLegacy');

  assert.equal(
    resolveModuleOrPathSelector(inventory, 'src/features/Home.tsx', REPOSITORY_ROOT)
      .migrationAreaId,
    'client.featureLegacy',
  );
  assert.equal(
    resolveModuleOrPathSelector(inventory, 'src/features/FAQPage.tsx', REPOSITORY_ROOT)
      .migrationAreaId,
    'client.featureLegacy',
  );
  const featurePatterns = publicRoutesForScope(featureArea.routeScope, routes)
    .map(route => route.pattern);
  assert.ok(featurePatterns.includes('/'));
  assert.ok(featurePatterns.includes('/faq'));

  assert.equal(
    resolveModuleOrPathSelector(
      inventory,
      'src/components/AppErrorBoundary.tsx',
      REPOSITORY_ROOT,
    ).migrationAreaId,
    'client.platformLegacy',
  );
  assert.equal(publicRoutesForScope(platformArea.routeScope, routes).length, routes.routes.length);
});

test('production shared server changes include legacy runtime checks', () => {
  const plan = loadAgentCheckPlan({
    repositoryRoot: REPOSITORY_ROOT,
    selector: 'server/shared/http/asyncRoute.ts',
  });

  assert.ok(plan.checks.some(check => check.script === 'test:server-build'));
});

test('agent map rejects an invalid graph before emitting a partial result', () => {
  const root = mkdtempSync(join(tmpdir(), 'arena-agent-map-invalid-graph-'));
  try {
    mkdirSync(join(root, 'config'), { recursive: true });
    writeFileSync(join(root, 'config/module-boundaries.json'), JSON.stringify({
      schemaVersion: 2,
      modules: [],
      migrationAreas: [],
      exceptions: {},
    }));
    assert.throws(
      () => loadAgentMap({ repositoryRoot: root }),
      /module graph is invalid; refusing to emit a partial map/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('public route inventory rejects unsafe origins, display metadata and symlinked input', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'arena-agent-map-routes-'));
  const repository = join(fixtureRoot, 'repository');
  const outside = join(fixtureRoot, 'outside-routes.json');
  const routePath = join(repository, 'src/shared/seo/publicRouteInventory.json');
  try {
    mkdirSync(join(repository, 'src/shared/seo'), { recursive: true });
    writeFileSync(routePath, JSON.stringify({
      schemaVersion: 1,
      canonicalOrigin: 'javascript:alert(1)',
      routes: [],
    }));
    assert.throws(
      () => readPublicRouteInventory(repository),
      /canonicalOrigin must be a valid HTTP\(S\) origin/i,
    );

    writeFileSync(routePath, JSON.stringify({
      ...routesFixture,
      routes: [{
        ...routesFixture.routes[0],
        owner: 'alpha-team\u2028Injected route owner',
      }],
    }));
    assert.throws(
      () => readPublicRouteInventory(repository),
      /Every public route requires/i,
    );

    writeFileSync(outside, JSON.stringify(routesFixture));
    rmSync(routePath);
    symlinkSync(outside, routePath);
    assert.throws(
      () => readPublicRouteInventory(repository),
      /regular file, not a symlink.*publicRouteInventory\.json/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
