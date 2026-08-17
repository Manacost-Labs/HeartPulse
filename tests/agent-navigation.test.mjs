import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createAgentMap,
  formatAgentMap,
  formatAgentMapJson,
  loadAgentMap,
  readPublicRouteInventory,
} from '../scripts/agent-map.mjs';

const inventoryFixture = {
  schemaVersion: 1,
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
    clientModules: 0,
    serverModules: 2,
    publicRoutes: 2,
    sources: 8,
    edges: 3,
    runtimeCycles: 0,
  });
  assert.deepEqual(map.modules.map(module => module.id), ['server.alpha', 'server.beta']);
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

  const shuffled = createAgentMap({
    inventory: {
      ...inventoryFixture,
      modules: [...inventoryFixture.modules].reverse(),
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
  assert.equal(JSON.stringify(shuffled), JSON.stringify(map));
  assert.equal(formatAgentMapJson(shuffled), formatAgentMapJson(map));
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
});

test('agent map rejects an invalid graph before emitting a partial result', () => {
  const root = mkdtempSync(join(tmpdir(), 'arena-agent-map-invalid-graph-'));
  try {
    mkdirSync(join(root, 'config'), { recursive: true });
    writeFileSync(join(root, 'config/module-boundaries.json'), JSON.stringify({
      schemaVersion: 1,
      modules: [],
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

test('public route inventory requires a canonical origin and rejects symlinked input', () => {
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
