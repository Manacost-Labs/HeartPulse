import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createAgentImpact,
  formatAgentImpact,
  formatAgentImpactJson,
  loadAgentImpact,
  parseAgentImpactArgs,
} from '../scripts/agent-impact.mjs';
import { resolveModuleOrPathSelector } from '../scripts/lib/module-inventory.mjs';

const modules = [
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
  {
    id: 'server.beta',
    runtime: 'server',
    root: 'server/modules/beta',
    purpose: 'Owns beta behavior.',
    owner: 'beta-team',
    publicEntry: 'server/modules/beta/public.ts',
    dependencies: ['server.alpha'],
    focusedTests: ['npm run test:shared', 'npm run test:beta'],
    docs: ['docs/specs/beta.md'],
  },
  {
    id: 'server.gamma',
    runtime: 'server',
    root: 'server/modules/gamma',
    purpose: 'Owns gamma behavior.',
    owner: 'gamma-team',
    publicEntry: 'server/modules/gamma/public.ts',
    dependencies: ['server.alpha'],
    focusedTests: ['npm run test:shared', 'npm run test:gamma'],
    docs: ['docs/specs/gamma.md'],
  },
  {
    id: 'server.delta',
    runtime: 'server',
    root: 'server/modules/delta',
    purpose: 'Owns delta behavior.',
    owner: 'delta-team',
    publicEntry: 'server/modules/delta/public.ts',
    dependencies: ['server.beta', 'server.gamma'],
    focusedTests: ['npm run test:delta'],
    docs: ['docs/specs/delta.md'],
  },
  {
    id: 'server.echo',
    runtime: 'server',
    root: 'server/modules/echo',
    purpose: 'Declares a dependent without a resolved import.',
    owner: 'echo-team',
    publicEntry: 'server/modules/echo/public.ts',
    dependencies: ['server.delta'],
    focusedTests: ['npm run test:echo'],
    docs: ['docs/specs/echo.md'],
  },
];

const inventory = {
  schemaVersion: 1,
  modules,
  exceptions: {
    internalImport: [{
      source: 'server/modules/beta/service.ts',
      target: 'server/modules/alpha/internal.ts',
      kind: 'runtime',
      reason: 'Temporary fixture debt.',
      owner: 'architecture-test',
      expiresOn: '2026-12-31',
    }],
  },
};

const legacyArea = {
  id: 'server.legacyAlpha',
  runtime: 'server',
  roots: ['server/legacy'],
  excludeRoots: [],
  purpose: 'Owns the legacy alpha composition while it moves behind server.alpha.',
  owner: 'alpha-team',
  targetModules: ['server.alpha'],
  focusedTests: ['npm run test:legacy-alpha'],
  docs: ['docs/specs/legacy-alpha.md'],
  safeStarts: ['server/legacy/entry.ts'],
  routeScope: { mode: 'owners', owners: ['alpha-routes'] },
  knownDebt: ['Legacy alpha handlers still live outside the module root.'],
};

const graph = {
  edges: [
    { source: 'server/modules/beta/service.ts', target: 'server/modules/alpha/public.ts', kind: 'runtime' },
    { source: 'server/modules/gamma/service.ts', target: 'server/modules/alpha/public.ts', kind: 'type' },
    { source: 'server/modules/delta/from-beta.ts', target: 'server/modules/beta/service.ts', kind: 'runtime' },
    { source: 'server/modules/delta/from-gamma.ts', target: 'server/modules/gamma/service.ts', kind: 'runtime' },
    { source: 'server/modules/delta/join.ts', target: 'server/modules/delta/from-beta.ts', kind: 'runtime' },
    { source: 'server/modules/delta/join.ts', target: 'server/modules/delta/from-gamma.ts', kind: 'runtime' },
    { source: 'server/modules/alpha/public.ts', target: 'server/modules/delta/join.ts', kind: 'type' },
  ],
};

test('agent impact walks reverse runtime and type edges deterministically through diamonds and cycles', () => {
  const impact = createAgentImpact({
    inventory,
    graph,
    selection: {
      selector: 'server.alpha',
      kind: 'module',
      path: 'server/modules/alpha',
      moduleId: 'server.alpha',
    },
  });

  assert.equal(impact.schemaVersion, 1);
  assert.equal(impact.command, 'impact');
  assert.equal(impact.ok, true);
  assert.deepEqual(impact.target, {
    selector: 'server.alpha',
    kind: 'module',
    path: 'server/modules/alpha',
    moduleId: 'server.alpha',
  });
  assert.deepEqual(impact.directCallers, [
    { path: 'server/modules/beta/service.ts', moduleId: 'server.beta', kinds: ['runtime'] },
    { path: 'server/modules/gamma/service.ts', moduleId: 'server.gamma', kinds: ['type'] },
  ]);
  assert.deepEqual(impact.transitiveCallers.map(caller => [caller.path, caller.distance]), [
    ['server/modules/beta/service.ts', 1],
    ['server/modules/delta/from-beta.ts', 2],
    ['server/modules/delta/from-gamma.ts', 2],
    ['server/modules/delta/join.ts', 3],
    ['server/modules/gamma/service.ts', 1],
  ]);
  assert.deepEqual(impact.affectedModules.map(module => [module.id, module.reasons]), [
    ['server.alpha', ['selected']],
    ['server.beta', ['imports-target']],
    ['server.delta', ['imports-target']],
    ['server.echo', ['depends-on-affected-module']],
    ['server.gamma', ['imports-target']],
  ]);
  assert.deepEqual(impact.focusedTests, [
    'npm run test:alpha',
    'npm run test:beta',
    'npm run test:delta',
    'npm run test:echo',
    'npm run test:gamma',
    'npm run test:shared',
  ]);
  assert.deepEqual(impact.docs, [
    'docs/specs/alpha.md',
    'docs/specs/beta.md',
    'docs/specs/delta.md',
    'docs/specs/echo.md',
    'docs/specs/gamma.md',
  ]);
  assert.deepEqual(impact.knownDebt, [{
    moduleId: 'server.alpha',
    category: 'internalImport',
    source: 'server/modules/beta/service.ts',
    target: 'server/modules/alpha/internal.ts',
    kind: 'runtime',
    reason: 'Temporary fixture debt.',
    owner: 'architecture-test',
    expiresOn: '2026-12-31',
  }, {
    moduleId: 'server.beta',
    category: 'internalImport',
    source: 'server/modules/beta/service.ts',
    target: 'server/modules/alpha/internal.ts',
    kind: 'runtime',
    reason: 'Temporary fixture debt.',
    owner: 'architecture-test',
    expiresOn: '2026-12-31',
  }]);
  assert.deepEqual(impact.routeImpact, {
    status: 'not-inferred',
    reason: 'Public route ownership is tracked separately and is not inferred from code modules.',
  });

  const reversed = createAgentImpact({
    inventory: { ...inventory, modules: [...modules].reverse() },
    graph: { edges: [...graph.edges].reverse() },
    selection: impact.target,
  });
  assert.equal(formatAgentImpactJson(reversed), formatAgentImpactJson(impact));
  assert.equal(formatAgentImpactJson(impact).endsWith('\n'), true);
  assert.equal(formatAgentImpactJson(impact).endsWith('\n\n'), false);
  assert.doesNotMatch(formatAgentImpactJson(impact), /\/home\/|\\\\/);
});

test('agent impact explicitly represents a repository path with no owning module', () => {
  const impact = createAgentImpact({
    inventory,
    graph: {
      edges: [{
        source: 'server/modules/beta/service.ts',
        target: 'server/shared/config.ts',
        kind: 'runtime',
      }],
    },
    selection: {
      selector: 'server/shared/config.ts',
      kind: 'file',
      path: 'server/shared/config.ts',
      moduleId: null,
    },
  });

  assert.equal(impact.target.moduleId, null);
  assert.deepEqual(impact.directCallers, [{
    path: 'server/modules/beta/service.ts',
    moduleId: 'server.beta',
    kinds: ['runtime'],
  }]);
  assert.deepEqual(impact.affectedModules.map(module => module.id), [
    'server.beta',
    'server.delta',
    'server.echo',
  ]);
  assert.match(formatAgentImpact(impact), /Owning module: \(none\)/);
  assert.match(formatAgentImpact(impact), /Route impact: not inferred/);
});

test('shared paths conservatively include every same-runtime module and migration area', () => {
  const publicRouteInventory = {
    schemaVersion: 1,
    canonicalOrigin: 'https://arena.example',
    routes: [{
      id: 'alpha-page',
      pattern: '/alpha',
      kind: 'static',
      owner: 'alpha-routes',
      indexPolicy: 'index',
    }, {
      id: 'unrelated-page',
      pattern: '/other',
      kind: 'static',
      owner: 'other-routes',
      indexPolicy: 'index',
    }],
  };
  const impact = createAgentImpact({
    inventory: {
      ...inventory,
      migrationAreas: [legacyArea],
    },
    graph: {
      edges: [{
        source: 'server/legacy/entry.ts',
        target: 'server/shared/http/asyncRoute.ts',
        kind: 'runtime',
      }],
    },
    publicRouteInventory,
    selection: {
      selector: 'server/shared/http/asyncRoute.ts',
      kind: 'file',
      path: 'server/shared/http/asyncRoute.ts',
      moduleId: null,
      sharedRoot: 'server/shared',
      sharedRuntime: 'server',
    },
  });

  assert.deepEqual(impact.directCallers, [{
    path: 'server/legacy/entry.ts',
    moduleId: null,
    kinds: ['runtime'],
  }]);
  assert.deepEqual(
    impact.affectedModules.map(module => [module.id, module.reasons]),
    [...modules]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(module => [module.id, ['shared-runtime']]),
  );
  assert.ok(impact.focusedTests.includes('npm run test:legacy-alpha'));
  assert.ok(impact.docs.includes('docs/specs/legacy-alpha.md'));
  assert.ok(impact.knownDebt.some(debt => debt.migrationAreaId === 'server.legacyAlpha'));
  assert.deepEqual(
    impact.routeImpact.routes.map(route => route.id),
    ['alpha-page', 'unrelated-page'],
  );
});

test('agent impact enriches a legacy path with migration ownership, targets, routes, tests and debt', () => {
  const impact = createAgentImpact({
    inventory: {
      ...inventory,
      migrationAreas: [legacyArea],
    },
    graph: {
      edges: [{
        source: 'server/modules/beta/service.ts',
        target: 'server/legacy/entry.ts',
        kind: 'runtime',
      }],
    },
    publicRouteInventory: {
      schemaVersion: 1,
      canonicalOrigin: 'https://arena.example',
      routes: [{
        id: 'alpha-page',
        pattern: '/alpha',
        kind: 'static',
        owner: 'alpha-routes',
        indexPolicy: 'index',
      }, {
        id: 'unrelated-page',
        pattern: '/other',
        kind: 'static',
        owner: 'other-routes',
        indexPolicy: 'index',
      }],
    },
    selection: {
      selector: 'server/legacy/entry.ts',
      kind: 'file',
      path: 'server/legacy/entry.ts',
      moduleId: null,
      migrationAreaId: 'server.legacyAlpha',
    },
  });

  assert.equal(impact.target.migrationAreaId, 'server.legacyAlpha');
  assert.deepEqual(impact.affectedModules.map(module => [module.id, module.reasons]), [
    ['server.alpha', ['migration-target']],
    ['server.beta', ['imports-target']],
    ['server.delta', ['depends-on-affected-module']],
    ['server.echo', ['depends-on-affected-module']],
    ['server.gamma', ['depends-on-affected-module']],
  ]);
  assert.ok(impact.focusedTests.includes('npm run test:legacy-alpha'));
  assert.ok(impact.docs.includes('docs/specs/legacy-alpha.md'));
  assert.ok(impact.knownDebt.some(debt => (
    debt.migrationAreaId === 'server.legacyAlpha'
      && /outside the module root/i.test(debt.reason)
  )));
  assert.deepEqual(impact.routeImpact, {
    status: 'mapped',
    routes: [{
      id: 'alpha-page',
      pattern: '/alpha',
      kind: 'static',
      owner: 'alpha-routes',
      indexPolicy: 'index',
    }],
  });
  assert.match(formatAgentImpact(impact), /Migration area: server\.legacyAlpha/);
  assert.match(formatAgentImpact(impact), /\/alpha \(alpha-page\)/);
});

test('agent impact treats the repository root as the complete deterministic change surface', () => {
  const secondArea = {
    ...legacyArea,
    id: 'server.legacyBeta',
    roots: ['server/legacy-beta'],
    targetModules: ['server.beta'],
    focusedTests: ['npm run test:beta', 'npm run test:legacy-beta'],
    docs: ['docs/specs/beta.md', 'docs/specs/legacy-beta.md'],
    safeStarts: ['server/legacy-beta/entry.ts', 'server/legacy-beta/routes.ts'],
    routeScope: { mode: 'owners', owners: ['beta-routes', 'product-shell'] },
    knownDebt: ['Legacy beta routes remain outside the module.', 'Legacy beta storage remains.'],
  };
  const publicRouteInventory = {
    schemaVersion: 1,
    canonicalOrigin: 'https://arena.example',
    routes: [
      {
        id: 'beta-page',
        pattern: '/beta',
        kind: 'static',
        owner: 'beta-routes',
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
  const rootImpact = createAgentImpact({
    inventory: { ...inventory, migrationAreas: [legacyArea, secondArea] },
    graph,
    publicRouteInventory,
    selection: {
      selector: 'root',
      kind: 'root',
      path: '.',
      moduleId: null,
      migrationAreaId: null,
    },
  });

  assert.deepEqual(
    rootImpact.affectedModules.map(module => module.id),
    modules.map(module => module.id).sort(),
  );
  assert.ok(rootImpact.focusedTests.includes('npm run test:legacy-alpha'));
  assert.ok(rootImpact.focusedTests.includes('npm run test:legacy-beta'));
  assert.deepEqual(rootImpact.routeImpact.routes.map(route => route.id), ['home', 'beta-page']);
  assert.equal(rootImpact.directCallers.length, 0);
  assert.equal(rootImpact.transitiveCallers.length, 0);

  const reversed = createAgentImpact({
    inventory: {
      ...inventory,
      modules: [...modules].reverse(),
      migrationAreas: [secondArea, legacyArea].map(area => ({
        ...area,
        roots: [...area.roots].reverse(),
        targetModules: [...area.targetModules].reverse(),
        focusedTests: [...area.focusedTests].reverse(),
        docs: [...area.docs].reverse(),
        safeStarts: [...area.safeStarts].reverse(),
        routeScope: {
          ...area.routeScope,
          owners: [...area.routeScope.owners].reverse(),
        },
        knownDebt: [...area.knownDebt].reverse(),
      })),
    },
    graph: { edges: [...graph.edges].reverse() },
    publicRouteInventory: {
      ...publicRouteInventory,
      routes: [...publicRouteInventory.routes].reverse(),
    },
    selection: rootImpact.target,
  });
  assert.equal(formatAgentImpactJson(reversed), formatAgentImpactJson(rootImpact));
});

test('selecting a migration-area root includes every disjoint root and honors exclusions', () => {
  const area = {
    ...legacyArea,
    roots: ['server/legacy/a', 'server/legacy/b'],
    excludeRoots: ['server/legacy/b/excluded.ts'],
    safeStarts: ['server/legacy/a/entry.ts'],
    routeScope: { mode: 'none' },
  };
  const impact = createAgentImpact({
    inventory: { ...inventory, migrationAreas: [area] },
    graph: {
      edges: [{
        source: 'server/modules/beta/service.ts',
        target: 'server/legacy/a/entry.ts',
        kind: 'runtime',
      }, {
        source: 'server/modules/gamma/service.ts',
        target: 'server/legacy/b/value.ts',
        kind: 'runtime',
      }, {
        source: 'server/modules/delta/join.ts',
        target: 'server/legacy/b/excluded.ts',
        kind: 'runtime',
      }],
    },
    publicRouteInventory: {
      schemaVersion: 1,
      canonicalOrigin: 'https://arena.example',
      routes: [],
    },
    selection: {
      selector: 'server/legacy/a',
      kind: 'migration-area',
      path: 'server/legacy/a',
      moduleId: null,
      migrationAreaId: 'server.legacyAlpha',
    },
  });

  assert.deepEqual(impact.directCallers.map(caller => caller.path), [
    'server/modules/beta/service.ts',
    'server/modules/gamma/service.ts',
  ]);
});

test('impact selector resolves modules, nested files and unowned paths without leaving the repository', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'arena-agent-impact-selector-'));
  const repository = join(fixtureRoot, 'repository');
  const outside = join(fixtureRoot, 'outside');
  try {
    mkdirSync(join(repository, 'server/modules/alpha'), { recursive: true });
    mkdirSync(join(repository, 'server/legacy/config'), { recursive: true });
    mkdirSync(join(repository, 'server/shared/config'), { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(repository, 'server/modules/alpha/service.ts'), 'export {};\n');
    writeFileSync(join(repository, 'server/legacy/config/value.ts'), 'export {};\n');
    writeFileSync(join(repository, 'server/shared/config/value.ts'), 'export {};\n');
    writeFileSync(join(outside, 'external.ts'), 'export {};\n');

    const selectorInventory = {
      schemaVersion: 2,
      sharedRoots: { client: ['src/shared'], server: ['server/shared'] },
      modules: [modules[0]],
      migrationAreas: [{
        ...legacyArea,
        roots: ['server/legacy/config'],
        safeStarts: ['server/legacy/config/value.ts'],
      }],
      exceptions: {},
    };
    assert.deepEqual(
      resolveModuleOrPathSelector(selectorInventory, 'root', repository),
      {
        selector: 'root',
        kind: 'root',
        path: '.',
        moduleId: null,
        migrationAreaId: null,
      },
    );
    assert.deepEqual(
      resolveModuleOrPathSelector(selectorInventory, 'server.alpha', repository),
      {
        selector: 'server.alpha',
        kind: 'module',
        path: 'server/modules/alpha',
        moduleId: 'server.alpha',
      },
    );
    assert.deepEqual(
      resolveModuleOrPathSelector(
        selectorInventory,
        './server/modules/alpha/service.ts',
        repository,
      ),
      {
        selector: './server/modules/alpha/service.ts',
        kind: 'file',
        path: 'server/modules/alpha/service.ts',
        moduleId: 'server.alpha',
      },
    );
    assert.deepEqual(
      resolveModuleOrPathSelector(
        selectorInventory,
        'server/shared/config/value.ts',
        repository,
      ),
      {
        selector: 'server/shared/config/value.ts',
        kind: 'file',
        path: 'server/shared/config/value.ts',
        moduleId: null,
        sharedRoot: 'server/shared',
        sharedRuntime: 'server',
      },
    );
    assert.deepEqual(
      resolveModuleOrPathSelector(
        selectorInventory,
        'server/legacy/config',
        repository,
      ),
      {
        selector: 'server/legacy/config',
        kind: 'migration-area',
        path: 'server/legacy/config',
        moduleId: null,
        migrationAreaId: 'server.legacyAlpha',
      },
    );
    assert.deepEqual(
      resolveModuleOrPathSelector(
        selectorInventory,
        'server/legacy/config/value.ts',
        repository,
      ),
      {
        selector: 'server/legacy/config/value.ts',
        kind: 'file',
        path: 'server/legacy/config/value.ts',
        moduleId: null,
        migrationAreaId: 'server.legacyAlpha',
      },
    );

    mkdirSync(join(repository, 'server/orphan'), { recursive: true });
    writeFileSync(join(repository, 'server/orphan/value.ts'), 'export {};\n');
    assert.throws(
      () => resolveModuleOrPathSelector(
        selectorInventory,
        'server/orphan/value.ts',
        repository,
      ),
      /not owned by a module or migration area/i,
    );

    assert.throws(
      () => resolveModuleOrPathSelector({
        ...selectorInventory,
        migrationAreas: [
          selectorInventory.migrationAreas[0],
          {
            ...selectorInventory.migrationAreas[0],
            id: 'server.overlap',
            roots: ['server/legacy/config/value.ts'],
          },
        ],
      }, 'server/legacy/config/value.ts', repository),
      /multiple migration areas/i,
    );

    for (const unsafe of [
      '../outside/external.ts',
      'server/../outside/external.ts',
      'server\\shared\\config\\value.ts',
      'server/shared/line\nbreak.ts',
      'server/shared/escape\u001B.ts',
      join(repository, 'server/shared/config/value.ts'),
      'server/shared/missing.ts',
    ]) {
      assert.throws(
        () => resolveModuleOrPathSelector(selectorInventory, unsafe, repository),
        /not safe|does not exist/i,
      );
    }

    symlinkSync(join(outside, 'external.ts'), join(repository, 'server/legacy/config/external.ts'));
    assert.throws(
      () => resolveModuleOrPathSelector(
        selectorInventory,
        'server/legacy/config/external.ts',
        repository,
      ),
      /not a symlink/i,
    );

    symlinkSync(outside, join(repository, 'linked-outside'));
    assert.throws(
      () => resolveModuleOrPathSelector(
        selectorInventory,
        'linked-outside/external.ts',
        repository,
      ),
      /resolves outside the repository/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('agent impact scopes an unowned directory to graph files below that directory', () => {
  const impact = createAgentImpact({
    inventory,
    graph: {
      edges: [{
        source: 'server/modules/beta/service.ts',
        target: 'server/shared/config/value.ts',
        kind: 'runtime',
      }, {
        source: 'server/modules/gamma/service.ts',
        target: 'server/shared/other.ts',
        kind: 'runtime',
      }],
    },
    selection: {
      selector: 'server/shared/config',
      kind: 'directory',
      path: 'server/shared/config',
      moduleId: null,
      sharedRoot: 'server/shared',
      sharedRuntime: 'server',
    },
  });

  assert.equal(impact.target.sharedRoot, 'server/shared');
  assert.equal(impact.target.sharedRuntime, 'server');
  assert.deepEqual(impact.directCallers, [{
    path: 'server/modules/beta/service.ts',
    moduleId: 'server.beta',
    kinds: ['runtime'],
  }]);
});

test('agent impact fails closed on an invalid module graph', () => {
  const root = mkdtempSync(join(tmpdir(), 'arena-agent-impact-invalid-graph-'));
  try {
    mkdirSync(join(root, 'config'), { recursive: true });
    writeFileSync(join(root, 'config/module-boundaries.json'), JSON.stringify({
      schemaVersion: 2,
      modules: [],
      migrationAreas: [],
      exceptions: {},
    }));
    assert.throws(
      () => loadAgentImpact({ repositoryRoot: root, selector: 'server/shared/config.ts' }),
      /module graph is invalid; refusing to infer impact/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('agent impact CLI grammar accepts one selector and rejects ambiguous arguments', () => {
  assert.deepEqual(parseAgentImpactArgs(['--help']), { help: true });
  assert.deepEqual(parseAgentImpactArgs(['server.alpha']), {
    json: false,
    selector: 'server.alpha',
  });
  assert.deepEqual(parseAgentImpactArgs(['server.alpha', '--json']), {
    json: true,
    selector: 'server.alpha',
  });
  for (const args of [
    [],
    ['server.alpha', 'server.beta'],
    ['server.alpha', '--unknown'],
    ['server.alpha', '--json', '--json'],
    ['--help', 'server.alpha'],
  ]) {
    assert.deepEqual(parseAgentImpactArgs(args), { error: true });
  }
});
