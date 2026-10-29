import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';

import { createAgentImpact } from '../scripts/agent-impact.mjs';
import { analyzeModuleBoundaries } from '../scripts/check-module-boundaries.mjs';
import { FULL_SHARDS, planTestShards } from '../scripts/ci-test-plan.mjs';
import { selectAffectedTests } from '../scripts/lib/ci-affected-tests.mjs';
import { resolveModuleOrPathSelector } from '../scripts/lib/module-inventory.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(repositoryRoot, 'scripts', 'ci-affected-tests.mjs');
const PLAN_SCRIPT = path.join(repositoryRoot, 'scripts', 'ci-test-plan.mjs');
const PROPERTY_SETTINGS = {
  numRuns: Number(process.env.FAST_CHECK_RUNS || 200),
  seed: Number(process.env.FAST_CHECK_SEED || 20_261_029),
};

const importGraph = analyzeModuleBoundaries({ rootDir: repositoryRoot });
assert.ok(importGraph.ok, 'the repository import graph must be valid for these tests');

const realConfigs = {
  edges: importGraph.edges,
  registry: JSON.parse(readFileSync(path.join(repositoryRoot, 'tests/test-suites.json'), 'utf8')),
  inventory: JSON.parse(readFileSync(path.join(repositoryRoot, 'config/module-boundaries.json'), 'utf8')),
  catalog: JSON.parse(readFileSync(path.join(repositoryRoot, 'config/architecture-catalog.json'), 'utf8')),
};

/**
 * A small repository: `alpha` is used by `beta`, `beta` by `delta`, `gamma`
 * stands alone, `lonely` has no test, and src/features/Legacy.tsx is legacy.
 */
const miniConfigs = {
  registry: {
    suites: [
      { id: 'unit', files: ['tests/alpha.test.ts', 'tests/beta.test.ts', 'tests/delta.test.ts', 'tests/gamma.test.ts', 'tests/legacy.test.ts'] },
      { id: 'integration', files: ['tests/alpha-api.test.ts'] },
      { id: 'contract', files: [] },
      { id: 'browser', files: ['tests/alpha-browser.test.mjs', 'tests/gamma-browser.test.mjs'] },
      { id: 'production-smoke', files: [] },
    ],
  },
  inventory: {
    sharedRoots: [{ id: 'shared-root.client', runtime: 'client', root: 'src/shared' }],
    modules: [
      { id: 'client.alpha', root: 'src/modules/alpha', dependencies: [] },
      { id: 'client.beta', root: 'src/modules/beta', dependencies: ['client.alpha'] },
      { id: 'client.delta', root: 'src/modules/delta', dependencies: ['client.beta'] },
      { id: 'client.gamma', root: 'src/modules/gamma', dependencies: [] },
      { id: 'client.lonely', root: 'src/modules/lonely', dependencies: [] },
    ],
  },
  catalog: {
    modules: [
      { name: 'alpha', paths: ['src/modules/alpha'], tests: ['tests/alpha.test.ts', 'tests/alpha-api.test.ts', 'tests/alpha-browser.test.mjs'] },
      { name: 'beta', paths: ['src/modules/beta'], tests: ['tests/beta.test.ts'] },
      { name: 'delta', paths: ['src/modules/delta'], tests: ['tests/delta.test.ts'] },
      { name: 'gamma', paths: ['src/modules/gamma'], tests: ['tests/gamma.test.ts', 'tests/gamma-browser.test.mjs'] },
      { name: 'lonely', paths: ['src/modules/lonely'], tests: [] },
    ],
    legacyAreas: [
      { name: 'legacy-page', paths: ['src/features/Legacy.tsx'], tests: ['tests/legacy.test.ts'] },
    ],
  },
};

function selectMini(changedFiles, edges = []) {
  return selectAffectedTests({ changedFiles, edges, ...miniConfigs });
}

function everyRegisteredFile(registry) {
  return registry.suites.flatMap(suite => suite.files);
}

function selectedFiles(selection) {
  return Object.values(selection.files).flat();
}

test('a change to a module selects its tests and the tests of every module that depends on it', () => {
  const selection = selectMini(['src/modules/alpha/model.ts']);
  assert.equal(selection.mode, 'subset');
  assert.deepEqual(selection.files, {
    unit: ['tests/alpha.test.ts', 'tests/beta.test.ts', 'tests/delta.test.ts'],
    integration: ['tests/alpha-api.test.ts'],
    contract: [],
    browser: ['tests/alpha-browser.test.mjs'],
    'production-smoke': [],
  });
  assert.deepEqual(selection.affectedModules, ['client.alpha', 'client.beta', 'client.delta']);
});

test('a change to a module that nothing depends on leaves other modules unselected', () => {
  assert.deepEqual(selectMini(['src/modules/delta/view.tsx']).files, {
    unit: ['tests/delta.test.ts'],
    integration: [],
    contract: [],
    browser: [],
    'production-smoke': [],
  });
  assert.deepEqual(selectMini(['src/modules/gamma/a.ts', 'src/modules/gamma/b.css']).files.browser, [
    'tests/gamma-browser.test.mjs',
  ]);
});

test('a changed registered test file is selected on its own', () => {
  const selection = selectMini(['tests/gamma.test.ts']);
  assert.equal(selection.mode, 'subset');
  assert.deepEqual(selectedFiles(selection), ['tests/gamma.test.ts']);
});

test('changes in several modules select the union of their tests', () => {
  const selection = selectMini(['src/modules/gamma/a.ts', 'src/modules/delta/b.ts', 'tests/alpha-api.test.ts']);
  assert.deepEqual(selectedFiles(selection).sort(), [
    'tests/alpha-api.test.ts',
    'tests/delta.test.ts',
    'tests/gamma-browser.test.mjs',
    'tests/gamma.test.ts',
  ]);
});

test('a legacy host file selects the tests the architecture catalog lists for it', () => {
  assert.deepEqual(selectedFiles(selectMini(['src/features/Legacy.tsx'])), ['tests/legacy.test.ts']);
});

test('a module that imports the changed module is selected even without a declared dependency', () => {
  const edges = [{ source: 'src/modules/gamma/view.ts', target: 'src/modules/alpha/model.ts', kind: 'runtime' }];
  const selection = selectMini(['src/modules/alpha/model.ts'], edges);
  assert.deepEqual(selection.affectedModules, ['client.alpha', 'client.beta', 'client.delta', 'client.gamma']);
  assert.ok(selection.files.browser.includes('tests/gamma-browser.test.mjs'));
  assert.deepEqual(selectMini(['src/modules/alpha/model.ts']).affectedModules, ['client.alpha', 'client.beta', 'client.delta']);
});

test('a changed legacy file also selects the modules that import it and their dependents', () => {
  const edges = [{ source: 'src/modules/beta/page.tsx', target: 'src/features/Legacy.tsx', kind: 'runtime' }];
  const selection = selectMini(['src/features/Legacy.tsx'], edges);
  assert.deepEqual(selection.affectedModules, ['client.beta', 'client.delta', 'legacy:legacy-page']);
  assert.deepEqual(selectedFiles(selection).sort(), ['tests/beta.test.ts', 'tests/delta.test.ts', 'tests/legacy.test.ts']);
});

test('the import graph is required', () => {
  assert.throws(() => selectAffectedTests({ changedFiles: ['docs/a.md'], ...miniConfigs }), /import graph/);
});

test('moving a file between modules selects both modules', () => {
  const selection = selectMini(['src/modules/gamma/x.ts', 'src/modules/delta/x.ts']);
  assert.deepEqual(selection.affectedModules, ['client.delta', 'client.gamma']);
});

test('only documentation selects nothing', () => {
  for (const files of [
    ['docs/runbooks/agent-integration.md'],
    ['docs/architecture/diagram.png'],
    ['changelog.d/2026-10-29-anything.md'],
    ['README.md', 'CHANGELOG.md', 'AGENTS.md'],
    ['docs/a.md', 'changelog.d/b.md', 'CONTRIBUTING.md'],
  ]) {
    const selection = selectMini(files);
    assert.equal(selection.mode, 'none', files.join(', '));
    assert.equal(selection.reason, 'only documentation changed');
    assert.deepEqual(selectedFiles(selection), []);
  }
  assert.deepEqual(Object.keys(selectMini(['docs/a.md']).files), [
    'unit', 'integration', 'contract', 'browser', 'production-smoke',
  ]);
});

test('an empty change selects nothing', () => {
  const selection = selectMini([]);
  assert.equal(selection.mode, 'none');
  assert.equal(selection.reason, 'no files changed');
});

test('Markdown next to code is code, not documentation', () => {
  assert.equal(selectMini(['src/modules/gamma/README.md']).mode, 'subset');
  assert.equal(selectMini(['scripts/notes.md']).mode, 'all');
  assert.equal(selectMini(['.github/pull_request_template.md']).mode, 'all');
});

test('dependencies, CI, tooling, configs and test infrastructure select everything', () => {
  const everything = everyRegisteredFile(miniConfigs.registry).sort();
  for (const file of [
    'package.json',
    'package-lock.json',
    '.npmrc',
    '.github/workflows/ci.yml',
    '.github/rulesets/main-merge-queue.json',
    'scripts/find-validated-release.mjs',
    'scripts/lib/module-inventory.mjs',
    'config/module-boundaries.json',
    'tests/test-suites.json',
    'tests/test-durations.json',
    'tests/helpers/browserLaunch.mjs',
    'tests/fixtures/data.json',
    'tsconfig.json',
    '.storybook/main.ts',
    'next.config.mjs',
  ]) {
    const selection = selectMini([file, 'docs/readme.md']);
    assert.equal(selection.mode, 'all', file);
    assert.deepEqual(selectedFiles(selection).sort(), everything, file);
  }
});

test('shared runtime code selects everything', () => {
  for (const file of ['src/shared/http.ts', 'server/shared/db.ts', 'shared/contracts.ts']) {
    const selection = selectAffectedTests({
      changedFiles: [file],
      edges: [],
      ...miniConfigs,
      inventory: {
        ...miniConfigs.inventory,
        sharedRoots: [
          { id: 'shared-root.client', runtime: 'client', root: 'src/shared' },
          { id: 'shared-root.server', runtime: 'server', root: 'server/shared' },
        ],
      },
    });
    assert.equal(selection.mode, 'all', file);
    assert.match(selection.reason, /shared runtime changed/);
  }
});

test('a file that belongs to no module selects everything and names the file', () => {
  const selection = selectMini(['src/modules/gamma/a.ts', 'server/legacyRoutes.ts']);
  assert.equal(selection.mode, 'all');
  assert.equal(selection.reason, 'not attributable to a module: server/legacyRoutes.ts');
});

test('a composition root selects everything and names the file', () => {
  for (const file of ['server/index.ts', 'src/features/DeferredRoutes.tsx', 'src/features/Battlegrounds.tsx']) {
    const selection = selectAffectedTests({ changedFiles: ['docs/readme.md', file], ...realConfigs });
    assert.equal(selection.mode, 'all', file);
    assert.equal(selection.reason, `composition root changed: ${file}`);
    assert.deepEqual(selectedFiles(selection).sort(), everyRegisteredFile(realConfigs.registry).sort(), file);
  }
});

test('a module without any registered test cannot be narrowed and selects everything', () => {
  assert.equal(selectMini(['src/modules/lonely/a.ts']).mode, 'all');
  assert.equal(selectMini(['src/modules/lonely/a.ts', 'src/modules/gamma/a.ts']).mode, 'all');
});

test('untrustworthy paths select everything', () => {
  for (const file of ['../outside.ts', '/etc/passwd', 'src\\modules\\gamma\\a.ts', '', 'a\0b']) {
    assert.equal(selectMini([file]).mode, 'all', JSON.stringify(file));
  }
});

test('a test file that is not in the registry selects everything and names the file', () => {
  for (const file of ['tests/production-auth-e2e.test.mjs', 'tests/brand-new.test.ts', 'tests/nested/other.spec.tsx']) {
    const selection = selectMini([file]);
    assert.equal(selection.mode, 'all', file);
    assert.equal(selection.reason, `test file is not in the test registry: ${file}`);
    assert.deepEqual(selectedFiles(selection).sort(), everyRegisteredFile(miniConfigs.registry).sort());
  }
  assert.equal(selectMini(['docs/a.md', 'tests/brand-new.test.ts']).mode, 'all');
});

// --- properties on the real configuration of this repository ---------------

const { registry, inventory, catalog } = realConfigs;
const allRegistered = everyRegisteredFile(registry).sort();
const modulesWithCatalogTests = inventory.modules.filter(module => (
  catalog.modules.some(entry => entry.paths.includes(module.root) && entry.tests.length > 0)
));

function agentImpactModules(module) {
  const selection = resolveModuleOrPathSelector(inventory, module.id, repositoryRoot);
  const impact = createAgentImpact({ inventory, graph: { edges: importGraph.edges }, selection });
  return new Set(impact.affectedModules.map(affected => affected.id));
}

function oracleTests(affectedIds) {
  const roots = new Set(inventory.modules.filter(module => affectedIds.has(module.id)).map(module => module.root));
  const registered = new Set(allRegistered);
  return catalog.modules
    .filter(entry => entry.paths.some(entryPath => roots.has(entryPath)))
    .flatMap(entry => entry.tests)
    .filter(file => registered.has(file));
}

const pathSegment = fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/);
const moduleFile = fc.record({
  module: fc.constantFrom(...modulesWithCatalogTests),
  name: pathSegment,
  extension: fc.constantFrom('ts', 'tsx', 'css'),
}).map(({ module, name, extension }) => ({ module, file: `${module.root}/${name}.${extension}` }));
const documentationFile = fc.oneof(
  fc.tuple(pathSegment, pathSegment).map(([dir, name]) => `docs/${dir}/${name}.md`),
  pathSegment.map(name => `docs/${name}.png`),
  pathSegment.map(name => `changelog.d/2026-10-29-${name}.md`),
  fc.constantFrom('README.md', 'CHANGELOG.md', 'AGENTS.md', 'CONTRIBUTING.md', 'DEPLOYMENT.md'),
);
const globalFile = fc.oneof(
  fc.constantFrom(
    'package.json', 'package-lock.json', '.npmrc', 'tests/test-suites.json', 'tests/test-durations.json',
    'tsconfig.json', '.storybook/main.ts', '.github/workflows/ci.yml',
  ),
  pathSegment.map(name => `.github/workflows/${name}.yml`),
  pathSegment.map(name => `scripts/${name}.mjs`),
  pathSegment.map(name => `config/${name}.json`),
  pathSegment.map(name => `tests/helpers/${name}.ts`),
  pathSegment.map(name => `src/shared/${name}.ts`),
  pathSegment.map(name => `server/shared/${name}.ts`),
  pathSegment.map(name => `shared/${name}.ts`),
  pathSegment.map(name => `unknown-dir/${name}.bin`),
  pathSegment.map(name => `tests/unregistered-${name}.test.ts`),
);
const registeredTestFile = fc.constantFrom(...allRegistered);
const anyChangedFile = fc.oneof(
  moduleFile.map(({ file }) => file),
  documentationFile,
  globalFile,
  registeredTestFile,
);

test('property: a changed module file selects every registered test of the modules agent-impact says it reaches', () => {
  fc.assert(fc.property(fc.array(moduleFile, { minLength: 1, maxLength: 4 }), changes => {
    const affected = new Set(changes.flatMap(({ module }) => [...agentImpactModules(module)]));
    const expected = [...new Set(oracleTests(affected))].sort();
    const selection = selectAffectedTests({ changedFiles: changes.map(({ file }) => file), ...realConfigs });

    const selected = new Set(selectedFiles(selection));
    for (const file of expected) assert.ok(selected.has(file), `${file} must be selected (${selection.mode})`);
    if (selection.mode === 'subset') {
      assert.deepEqual([...selected].sort(), expected);
      assert.ok(selected.size < allRegistered.length || expected.length === allRegistered.length);
    } else {
      assert.equal(selection.mode, 'all');
    }
  }), PROPERTY_SETTINGS);
});

test('property: documentation and changelog fragments alone select nothing', () => {
  fc.assert(fc.property(fc.array(documentationFile, { maxLength: 8 }), changedFiles => {
    const selection = selectAffectedTests({ changedFiles, ...realConfigs });
    assert.equal(selection.mode, 'none');
    assert.deepEqual(selectedFiles(selection), []);
  }), PROPERTY_SETTINGS);
});

test('property: one global or unknown file anywhere in the change selects every registered test', () => {
  fc.assert(fc.property(
    fc.array(anyChangedFile, { maxLength: 6 }),
    globalFile,
    fc.array(anyChangedFile, { maxLength: 6 }),
    (before, global, after) => {
      const selection = selectAffectedTests({ changedFiles: [...before, global, ...after], ...realConfigs });
      assert.equal(selection.mode, 'all');
      assert.deepEqual(selectedFiles(selection).sort(), allRegistered);
    },
  ), PROPERTY_SETTINGS);
});

test('property: adding files to a change never shrinks the selection', () => {
  fc.assert(fc.property(
    fc.array(anyChangedFile, { maxLength: 6 }),
    fc.array(anyChangedFile, { maxLength: 6 }),
    (smaller, extra) => {
      const without = new Set(selectedFiles(selectAffectedTests({ changedFiles: smaller, ...realConfigs })));
      const withExtra = new Set(selectedFiles(selectAffectedTests({
        changedFiles: [...smaller, ...extra],
        ...realConfigs,
      })));
      for (const file of without) assert.ok(withExtra.has(file), `${file} dropped out after adding files`);
    },
  ), PROPERTY_SETTINGS);
});

test('property: the answer does not depend on the order of the changed files', () => {
  fc.assert(fc.property(fc.array(anyChangedFile, { maxLength: 8 }), changedFiles => {
    const forward = selectAffectedTests({ changedFiles, ...realConfigs });
    const backward = selectAffectedTests({ changedFiles: [...changedFiles].reverse(), ...realConfigs });
    assert.equal(backward.mode, forward.mode);
    assert.deepEqual(backward.files, forward.files);
  }), PROPERTY_SETTINGS);
});

test('for every module the selection reaches at least the modules agent-impact reports', () => {
  for (const module of inventory.modules) {
    const selection = selectAffectedTests({ changedFiles: [`${module.root}/anything.ts`], ...realConfigs });
    const expected = agentImpactModules(module);
    if (selection.mode === 'all') {
      assert.deepEqual(selectedFiles(selection).sort(), allRegistered, module.id);
      continue;
    }
    for (const id of expected) assert.ok(selection.affectedModules.includes(id), `${module.id} must reach ${id}`);
    for (const file of oracleTests(expected)) assert.ok(selectedFiles(selection).includes(file), `${module.id}: ${file}`);
  }
});

test('a change in constructedArchetypes reaches publicApi through the import graph', () => {
  const selection = selectAffectedTests({
    changedFiles: ['server/modules/constructedArchetypes/metaSliceCache.ts'],
    ...realConfigs,
  });
  assert.equal(selection.mode, 'subset');
  assert.deepEqual(selection.affectedModules, [
    'server.constructedArchetypes', 'server.publicApi', 'server.radar', 'server.streamers',
  ]);
});

test('the real configuration only ever names registered files, once each', () => {
  const selection = selectAffectedTests({ changedFiles: [`${modulesWithCatalogTests[0].root}/x.ts`], ...realConfigs });
  const selected = selectedFiles(selection);
  assert.equal(new Set(selected).size, selected.length);
  for (const file of selected) assert.ok(allRegistered.includes(file), file);
});

// --- the command line: real git, real files --------------------------------

function git(directory, ...args) {
  return execFileSync('git', args, {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.test',
      GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.test',
    },
  }).trim();
}

function writeIn(directory, relativePath, contents) {
  const absolutePath = path.join(directory, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function withGitRepository(run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'ci-affected-'));
  try {
    git(directory, 'init', '-q', '-b', 'main');
    writeIn(directory, 'docs/guide.md', 'one\n');
    writeIn(directory, `${modulesWithCatalogTests[0].root}/model.ts`, 'export const one = 1;\n');
    git(directory, 'add', '-A');
    git(directory, 'commit', '-q', '-m', 'base');
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runCli(directory, ...args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: directory, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('the command compares two commits of a real repository', () => {
  withGitRepository(directory => {
    const base = git(directory, 'rev-parse', 'HEAD');
    const [firstModule] = modulesWithCatalogTests;

    writeIn(directory, 'docs/guide.md', 'two\n');
    git(directory, 'commit', '-qam', 'docs only');
    const docsHead = git(directory, 'rev-parse', 'HEAD');
    const docsRun = runCli(directory, '--base', base, '--head', docsHead);
    assert.equal(docsRun.status, 0, docsRun.stderr);
    assert.equal(JSON.parse(docsRun.stdout).mode, 'none');

    writeIn(directory, `${firstModule.root}/model.ts`, 'export const one = 2;\n');
    git(directory, 'commit', '-qam', 'module change');
    const moduleHead = git(directory, 'rev-parse', 'HEAD');
    const moduleRun = runCli(directory, '--base', base, '--head', moduleHead);
    const moduleSelection = JSON.parse(moduleRun.stdout);
    assert.ok(['subset', 'all'].includes(moduleSelection.mode));
    assert.ok(moduleSelection.affectedModules.includes(firstModule.id) || moduleSelection.mode === 'all');
    assert.ok(selectedFiles(moduleSelection).length > 0);

    writeIn(directory, 'package-lock.json', '{}\n');
    git(directory, 'add', '-A');
    git(directory, 'commit', '-qm', 'dependencies');
    const dependenciesRun = runCli(directory, '--base', base, '--head', 'HEAD');
    assert.equal(JSON.parse(dependenciesRun.stdout).mode, 'all');
    assert.equal(JSON.parse(dependenciesRun.stdout).reason, 'not attributable to a module: package-lock.json');
  });
});

test('a renamed file counts as a change in both the old and the new place', () => {
  withGitRepository(directory => {
    const [firstModule] = modulesWithCatalogTests;
    const base = git(directory, 'rev-parse', 'HEAD');
    mkdirSync(path.join(directory, 'docs/moved'), { recursive: true });
    git(directory, 'mv', `${firstModule.root}/model.ts`, 'docs/moved/model.ts');
    git(directory, 'commit', '-qm', 'move code into docs');
    const run = runCli(directory, '--base', base, '--head', 'HEAD');
    assert.notEqual(JSON.parse(run.stdout).mode, 'none', 'the code that left its module must still be tested');
  });
});

test('the command reads a list of files and writes the selection to --output', () => {
  withGitRepository(directory => {
    writeIn(directory, 'changed.txt', 'docs/a.md\n\nchangelog.d/2026-10-29-x.md\n');
    const outputPath = path.join(directory, 'selection.json');
    const run = runCli(directory, '--files-from', path.join(directory, 'changed.txt'), '--output', outputPath);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, '');
    const selection = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(selection.mode, 'none');
    assert.deepEqual(selection.files.unit, []);
  });
});

test('the command rejects bad arguments and unknown revisions with a non-zero exit', () => {
  withGitRepository(directory => {
    for (const args of [
      [],
      ['--base', 'main'],
      ['--head', 'main'],
      ['--base', 'main', '--head', 'main', '--files-from', 'x'],
      ['--base', '--head', 'main'],
      ['--base', '-x', '--head', 'main'],
      ['--files-from'],
      ['--unknown', 'x'],
    ]) {
      const run = runCli(directory, ...args);
      assert.equal(run.status, 2, args.join(' '));
      assert.match(run.stderr, /usage:/);
    }
    const missing = runCli(directory, '--base', 'no-such-revision', '--head', 'main');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /^\[ci-affected-tests\]/);
    assert.equal(missing.stdout, '');
  });
});

// --- the CI plan: which shards a run starts --------------------------------

const planRegistry = {
  suites: [
    { id: 'unit', files: ['tests/u1.test.ts', 'tests/u2.test.ts', 'tests/u3.test.ts'] },
    { id: 'integration', files: ['tests/i1.test.ts'] },
    { id: 'browser', files: Array.from({ length: 18 }, (_, index) => `tests/b${index + 1}-browser.test.mjs`) },
  ],
  quarantine: [{ file: 'tests/b18-browser.test.mjs', issue: 'x', reason: 'flaky' }],
};
const FULL_PLAN_SHARDS = { registryShards: [1, 2], browserShards: [1, 2, 3, 4, 5, 6, 7, 8, 9], affectedTests: '' };

function engineOutput(mode, files = {}) {
  return `${JSON.stringify({ mode, reason: 'engine reason', files: { unit: [], integration: [], browser: [], ...files }, affectedModules: [] }, null, 2)}\n`;
}

function plan(event, status, output) {
  return planTestShards({ event, status, output, registry: planRegistry });
}

test('a full run is two registry and nine browser shards', () => {
  assert.deepEqual(FULL_SHARDS, { registry: 2, browser: 9 });
});

test('the merge queue, a push and a manual run test everything whatever the selection says', () => {
  for (const event of ['merge_group', 'push', 'workflow_dispatch']) {
    const result = plan(event, 0, engineOutput('none'));
    assert.deepEqual(result, { mode: 'all', reason: `${event} always runs every test`, ...FULL_PLAN_SHARDS });
  }
});

test('a documentation-only pull request starts no test shard', () => {
  assert.deepEqual(plan('pull_request', 0, engineOutput('none')), {
    mode: 'none', reason: 'engine reason', registryShards: [], browserShards: [], affectedTests: '',
  });
});

test('a narrowed pull request passes the engine output unchanged and sizes the shards to it', () => {
  const output = engineOutput('subset', { unit: ['tests/u1.test.ts'], browser: ['tests/b1-browser.test.mjs', 'tests/b2-browser.test.mjs'] });
  assert.deepEqual(plan('pull_request', 0, output), {
    mode: 'subset', reason: 'engine reason', registryShards: [1], browserShards: [1, 2], affectedTests: output,
  });
  const wide = engineOutput('subset', {
    unit: ['tests/u1.test.ts', 'tests/u2.test.ts'],
    integration: ['tests/i1.test.ts'],
    browser: planRegistry.suites[2].files,
  });
  assert.deepEqual(plan('pull_request', 0, wide).registryShards, [1, 2]);
  assert.deepEqual(plan('pull_request', 0, wide).browserShards, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('a selection of only quarantined browser tests starts no browser shard', () => {
  const output = engineOutput('subset', { browser: ['tests/b18-browser.test.mjs'] });
  assert.deepEqual(plan('pull_request', 0, output).browserShards, []);
  assert.deepEqual(plan('pull_request', 0, output).registryShards, []);
});

test('an engine that answers all runs everything on a pull request', () => {
  assert.deepEqual(plan('pull_request', 0, engineOutput('all')), { mode: 'all', reason: 'engine reason', ...FULL_PLAN_SHARDS });
});

test('any failure of the selection runs everything on a pull request', () => {
  for (const [status, output, reason] of [
    [1, engineOutput('none'), 'affected-test selection failed (exit 1); running everything'],
    [2, null, 'affected-test selection failed (exit 2); running everything'],
    ['SIGTERM', null, 'affected-test selection failed (exit SIGTERM); running everything'],
    [0, null, 'affected-test selection was not written; running everything'],
    [0, '', 'affected-test selection was not written; running everything'],
    [0, '{"mode": "none"', 'affected-test selection is not JSON; running everything'],
    [0, '{"mode": "none"}', 'affected-test selection is malformed; running everything'],
    [0, '{"mode": "maybe", "files": {}}', 'affected-test selection is malformed; running everything'],
    [0, engineOutput('subset', { unit: ['tests/unregistered.test.ts'] }), 'affected-test selection is malformed; running everything'],
  ]) {
    assert.deepEqual(plan('pull_request', status, output), { mode: 'all', reason, ...FULL_PLAN_SHARDS }, String(output));
  }
});

function runPlan(directory, ...args) {
  const outputDirectory = mkdtempSync(path.join(tmpdir(), 'ci-test-plan-out-'));
  const githubOutput = path.join(outputDirectory, 'output');
  try {
    const { GITHUB_STEP_SUMMARY: _summary, ...env } = process.env;
    const result = spawnSync(process.execPath, [PLAN_SCRIPT, ...args], {
      cwd: directory, encoding: 'utf8', env: { ...env, GITHUB_OUTPUT: githubOutput },
    });
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(githubOutput, 'utf8');
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
}

test('the plan command writes GitHub outputs for a real pull request', () => {
  withGitRepository(directory => {
    const base = git(directory, 'rev-parse', 'HEAD');
    writeIn(directory, 'docs/guide.md', 'two\n');
    git(directory, 'commit', '-qam', 'docs only');
    const docsOutput = runPlan(directory, '--event', 'pull_request', '--base', base, '--head', 'HEAD');
    assert.ok(docsOutput.startsWith('mode=none\nreason=only documentation changed\nregistry-shards=[]\nbrowser-shards=[]\naffected-tests<<'), docsOutput);

    const unknownBase = runPlan(directory, '--event', 'pull_request', '--base', 'no-such-revision', '--head', 'HEAD');
    assert.ok(unknownBase.startsWith('mode=all\nreason=affected-test selection failed (exit 1); running everything\n'
      + 'registry-shards=[1,2]\nbrowser-shards=[1,2,3,4,5,6,7,8,9]\n'), unknownBase);
    const noBase = runPlan(directory, '--event', 'pull_request', '--base', '', '--head', 'HEAD');
    assert.ok(noBase.startsWith('mode=all\nreason=affected-test selection failed (exit 2)'), noBase);
  });
});

test('the plan command hands the shards exactly the selection the engine wrote', () => {
  withGitRepository(directory => {
    const base = git(directory, 'rev-parse', 'HEAD');
    const [firstModule] = modulesWithCatalogTests;
    writeIn(directory, `${firstModule.root}/model.ts`, 'export const one = 2;\n');
    git(directory, 'commit', '-qam', 'module change');
    const enginePath = path.join(directory, 'engine.json');
    assert.equal(runCli(directory, '--base', base, '--head', 'HEAD', '--output', enginePath).status, 0);
    const engineText = readFileSync(enginePath, 'utf8');

    const outputText = runPlan(directory, '--event', 'pull_request', '--base', base, '--head', 'HEAD');
    const [, delimiter] = outputText.match(/^affected-tests<<(\S+)$/m);
    const affectedTests = outputText.slice(outputText.indexOf(`<<${delimiter}\n`) + delimiter.length + 3, outputText.lastIndexOf(`\n${delimiter}\n`));
    assert.equal(JSON.parse(engineText).mode, 'subset');
    assert.ok(outputText.startsWith('mode=subset\n'), outputText);
    assert.equal(`${affectedTests}\n`, engineText);
  });
});
