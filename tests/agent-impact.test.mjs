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

test('impact selector resolves modules, nested files and unowned paths without leaving the repository', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'arena-agent-impact-selector-'));
  const repository = join(fixtureRoot, 'repository');
  const outside = join(fixtureRoot, 'outside');
  try {
    mkdirSync(join(repository, 'server/modules/alpha'), { recursive: true });
    mkdirSync(join(repository, 'server/shared/config'), { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(repository, 'server/modules/alpha/service.ts'), 'export {};\n');
    writeFileSync(join(repository, 'server/shared/config/value.ts'), 'export {};\n');
    writeFileSync(join(outside, 'external.ts'), 'export {};\n');

    const selectorInventory = {
      schemaVersion: 1,
      modules: [modules[0]],
      exceptions: {},
    };
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
        'server/shared/config',
        repository,
      ),
      {
        selector: 'server/shared/config',
        kind: 'directory',
        path: 'server/shared/config',
        moduleId: null,
      },
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

    symlinkSync(join(outside, 'external.ts'), join(repository, 'server/shared/external.ts'));
    assert.throws(
      () => resolveModuleOrPathSelector(
        selectorInventory,
        'server/shared/external.ts',
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
    },
  });

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
      schemaVersion: 1,
      modules: [],
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
