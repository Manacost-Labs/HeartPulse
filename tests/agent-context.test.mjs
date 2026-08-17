import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertReadOnlyCodegraphArgs,
  selectCodegraphIndex,
} from '../scripts/codegraph-worktree.mjs';
import {
  formatAgentContext,
  loadAgentContext,
} from '../scripts/agent-context.mjs';

const SHA = 'a'.repeat(40);

function indexFixture(overrides = {}) {
  return {
    current: {
      path: '/repo/task',
      head: SHA,
      dirty: false,
      hasIndex: false,
    },
    main: {
      path: '/repo/main',
      head: SHA,
      dirty: false,
      hasIndex: true,
    },
    ...overrides,
  };
}

test('shares the main CodeGraph index only for identical clean worktrees', () => {
  assert.deepEqual(selectCodegraphIndex(indexFixture()), {
    mode: 'shared',
    root: '/repo/main',
    prepare: 'sync',
    reason: 'main worktree matches the clean current HEAD',
  });

  for (const fixture of [
    indexFixture({
      current: { path: '/repo/task', head: 'b'.repeat(40), dirty: false, hasIndex: false },
    }),
    indexFixture({
      current: { path: '/repo/task', head: SHA, dirty: true, hasIndex: false },
    }),
    indexFixture({
      main: { path: '/repo/main', head: SHA, dirty: true, hasIndex: true },
    }),
  ]) {
    assert.deepEqual(selectCodegraphIndex(fixture), {
      mode: 'local',
      root: '/repo/task',
      prepare: 'init',
      reason: 'shared main index is not safe for this worktree state',
    });
  }
});

test('prefers an existing worktree-local index and syncs it before every read', () => {
  const fixture = indexFixture({
    current: { path: '/repo/task', head: SHA, dirty: true, hasIndex: true },
  });

  assert.deepEqual(selectCodegraphIndex(fixture), {
    mode: 'local',
    root: '/repo/task',
    prepare: 'sync',
    reason: 'current worktree already has a local index',
  });
});

test('CodeGraph wrapper accepts reads but rejects lifecycle and alternate-path arguments', () => {
  assert.doesNotThrow(() => assertReadOnlyCodegraphArgs(['explore', 'article routes']));
  assert.doesNotThrow(() => assertReadOnlyCodegraphArgs(['query', 'createRouter', '--limit', '5']));
  assert.doesNotThrow(() => assertReadOnlyCodegraphArgs(['status', '--json']));
  assert.throws(
    () => assertReadOnlyCodegraphArgs(['uninit']),
    /read-only CodeGraph commands/i,
  );
  for (const args of [
    ['explore', 'routes', '--path', '/repo/main'],
    ['explore', 'routes', '--path=/repo/main'],
    ['explore', 'routes', '-p', '/repo/main'],
    ['explore', 'routes', '-p=/repo/main'],
    ['explore', 'routes', '-p/repo/main'],
    ['explore', 'routes', '-ptmp'],
    ['status', '/repo/main'],
    ['status', '--json', '/repo/main'],
    ['status', '--', '--json'],
  ]) {
    assert.throws(
      () => assertReadOnlyCodegraphArgs(args),
      /owns (?:the status )?project (?:selection|path)/i,
    );
  }
});

test('agent context resolves a module by id or root and reports its public API and exceptions', () => {
  const root = mkdtempSync(join(tmpdir(), 'arena-agent-context-'));
  try {
    mkdirSync(join(root, 'config'), { recursive: true });
    mkdirSync(join(root, 'src/modules/accountRoute'), { recursive: true });
    writeFileSync(join(root, 'src/modules/accountRoute/public.ts'), [
      "export { default } from './AccountRoute';",
      "export type { AccountRouteProps } from './types';",
      'export const ACCOUNT_ROUTE_PATH = "/account";',
      '',
    ].join('\n'));
    writeFileSync(join(root, 'src/modules/accountRoute/public.css'), '@import "./account.css";\n');
    writeFileSync(join(root, 'config/module-boundaries.json'), JSON.stringify({
      schemaVersion: 1,
      moduleRoots: ['src/modules', 'server/modules'],
      sharedRoots: { client: ['src/shared'], server: ['server/shared'] },
      modules: [{
        id: 'client.accountRoute',
        runtime: 'client',
        root: 'src/modules/accountRoute',
        purpose: 'Account-facing route composition.',
        owner: 'identity-platform',
        publicEntry: 'src/modules/accountRoute/public.ts',
        publicStyleEntry: 'src/modules/accountRoute/public.css',
        dependencies: ['client.applicationConnect'],
        focusedTests: ['npm run test:application-connect', 'npm run test:routes'],
        docs: ['docs/architecture/module-boundaries.md'],
      }],
      allowlistBudgets: {
        missingPublicEntry: 0,
        internalImport: 1,
        moduleLegacyImport: 0,
        typeCycle: 0,
      },
      exceptions: {
        missingPublicEntry: [],
        internalImport: [{
          source: 'src/modules/accountRoute/AccountRoute.tsx',
          target: 'src/modules/applicationConnect/ui/ApplicationConnectPage.tsx',
          kind: 'runtime',
          owner: 'identity-platform',
          reason: 'Temporary legacy deep import.',
          expiresOn: '2026-12-31',
        }],
        moduleLegacyImport: [],
        typeCycle: [],
      },
    }, null, 2));

    const byId = loadAgentContext({ repositoryRoot: root, selector: 'client.accountRoute' });
    const byRoot = loadAgentContext({ repositoryRoot: root, selector: './src/modules/accountRoute/' });

    assert.deepEqual(byRoot, byId);
    assert.deepEqual(byId.publicApi, {
      entry: 'src/modules/accountRoute/public.ts',
      exists: true,
      exports: ['ACCOUNT_ROUTE_PATH', 'AccountRouteProps', 'default'],
    });
    assert.equal(byId.publicStyleEntry, 'src/modules/accountRoute/public.css');
    assert.deepEqual(byId.dependencies, ['client.applicationConnect']);
    assert.deepEqual(byId.focusedTests, [
      'npm run test:application-connect',
      'npm run test:routes',
    ]);
    assert.equal(byId.exceptions.length, 1);

    const output = formatAgentContext(byId);
    assert.match(output, /Module: client\.accountRoute/);
    assert.match(output, /Owner: identity-platform/);
    assert.match(output, /Public API entry: src\/modules\/accountRoute\/public\.ts/);
    assert.match(output, /Public style entry: src\/modules\/accountRoute\/public\.css/);
    assert.match(output, /- AccountRouteProps/);
    assert.match(output, /- client\.applicationConnect/);
    assert.match(output, /npm run test:routes/);
    assert.match(output, /docs\/architecture\/module-boundaries\.md/);
    assert.match(output, /Temporary legacy deep import/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('agent context makes a baseline missing public entry explicit', () => {
  const root = mkdtempSync(join(tmpdir(), 'arena-agent-context-missing-entry-'));
  try {
    mkdirSync(join(root, 'config'), { recursive: true });
    writeFileSync(join(root, 'config/module-boundaries.json'), JSON.stringify({
      schemaVersion: 1,
      modules: [{
        id: 'server.arena',
        runtime: 'server',
        root: 'server/modules/arena',
        purpose: 'Arena APIs.',
        owner: 'arena-platform',
        publicEntry: 'server/modules/arena/public.ts',
        dependencies: [],
        focusedTests: ['npm run test:arena-deck-routes'],
        docs: [],
      }],
      exceptions: {
        missingPublicEntry: [{
          source: 'server/modules/arena',
          target: 'server/modules/arena/public.ts',
          kind: 'missing-public-entry',
          owner: 'arena-platform',
          reason: 'Baseline migration.',
          expiresOn: '2026-12-31',
        }],
        internalImport: [],
        moduleLegacyImport: [],
        typeCycle: [],
      },
    }));

    const context = loadAgentContext({ repositoryRoot: root, selector: 'server/modules/arena' });
    assert.deepEqual(context.publicApi, {
      entry: 'server/modules/arena/public.ts',
      exists: false,
      exports: [],
    });
    assert.match(formatAgentContext(context), /Public API: missing/);
    assert.match(formatAgentContext(context), /Baseline migration/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('agent context fails clearly until the module inventory exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'arena-agent-context-no-inventory-'));
  try {
    assert.throws(
      () => loadAgentContext({ repositoryRoot: root, selector: 'client.accountRoute' }),
      /module inventory is missing.*config\/module-boundaries\.json/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('agent context rejects symlinked inventory and public API files', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'arena-agent-context-symlink-'));
  const repository = join(fixtureRoot, 'repository');
  const outside = join(fixtureRoot, 'outside');
  const inventory = {
    schemaVersion: 1,
    modules: [{
      id: 'client.alpha',
      runtime: 'client',
      root: 'src/modules/alpha',
      purpose: 'Alpha fixture.',
      owner: 'architecture-test',
      publicEntry: 'src/modules/alpha/public.ts',
      dependencies: [],
      focusedTests: [],
      docs: [],
    }],
    exceptions: {},
  };
  try {
    mkdirSync(join(repository, 'config'), { recursive: true });
    mkdirSync(join(repository, 'src/modules/alpha'), { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'module-boundaries.json'), JSON.stringify(inventory));
    writeFileSync(join(outside, 'public.ts'), 'export const PROMPT_INJECTION_FROM_OUTSIDE = true;\n');

    symlinkSync(join(outside, 'module-boundaries.json'), join(repository, 'config/module-boundaries.json'));
    assert.throws(
      () => loadAgentContext({ repositoryRoot: repository, selector: 'client.alpha' }),
      /regular file, not a symlink.*module-boundaries\.json/i,
    );

    rmSync(join(repository, 'config/module-boundaries.json'));
    writeFileSync(join(repository, 'config/module-boundaries.json'), JSON.stringify(inventory));
    symlinkSync(join(outside, 'public.ts'), join(repository, 'src/modules/alpha/public.ts'));
    assert.throws(
      () => loadAgentContext({ repositoryRoot: repository, selector: 'client.alpha' }),
      /regular file, not a symlink.*public\.ts/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('agent context rejects public API files reached through an escaping parent symlink', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'arena-agent-context-parent-symlink-'));
  const repository = join(fixtureRoot, 'repository');
  const outsideModule = join(fixtureRoot, 'outside-module');
  try {
    mkdirSync(join(repository, 'config'), { recursive: true });
    mkdirSync(join(repository, 'src/modules'), { recursive: true });
    mkdirSync(outsideModule, { recursive: true });
    writeFileSync(join(outsideModule, 'public.ts'), 'export const PROMPT_INJECTION_FROM_OUTSIDE = true;\n');
    writeFileSync(join(repository, 'config/module-boundaries.json'), JSON.stringify({
      schemaVersion: 1,
      modules: [{
        id: 'client.alpha',
        runtime: 'client',
        root: 'src/modules/alpha',
        purpose: 'Alpha fixture.',
        owner: 'architecture-test',
        publicEntry: 'src/modules/alpha/public.ts',
        dependencies: [],
        focusedTests: [],
        docs: [],
      }],
      exceptions: {},
    }));
    symlinkSync(outsideModule, join(repository, 'src/modules/alpha'));

    assert.throws(
      () => loadAgentContext({ repositoryRoot: repository, selector: 'client.alpha' }),
      /resolves outside the repository.*public\.ts/i,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
