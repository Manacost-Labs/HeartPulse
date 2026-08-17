import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAgentMap,
  formatAgentMap,
  formatAgentMapJson,
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
      dependencies: [],
      focusedTests: ['npm run test:alpha'],
      docs: ['docs/specs/alpha.md'],
    },
  ],
  exceptions: {},
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
  assert.match(output, /server\/modules\/beta\/service\.ts \[server\.beta\]/);
  assert.match(output, /\/beta \(beta\) \[beta-team\]/);
});
