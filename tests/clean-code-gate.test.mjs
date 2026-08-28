import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { analyzeSourceMetrics } from '../scripts/architecture-baseline.mjs';
import {
  changedFileMappings,
  isAuthoredTypeScript,
} from '../scripts/clean-code/cli.mjs';
import { collectCleanCodeSnapshot } from '../scripts/clean-code/source-collection.mjs';
import { resolveCleanCodeScope } from '../scripts/clean-code/git-scope.mjs';
import {
  acceptBudgetMigration,
  createBudgetMigration,
} from '../scripts/clean-code/baseline-migration.mjs';
import {
  createCleanCodeBaselineCandidate,
  evaluateCleanCodeSnapshot,
  renderCleanCodeReport,
  validateCleanCodeBaseline,
} from '../scripts/clean-code/core.mjs';

const baseline = {
  schemaVersion: 1,
  rules: { newFileMaxLines: 250 },
  budgetSources: {
    sourceDebt: 'config/source-debt-budgets.json',
    functionSize: 'config/function-size-budgets.json',
  },
  legacy: { fileLines: { 'src/legacy.ts': 300 } },
  exceptions: [],
};

const sourceDebt = {
  version: 1,
  budgets: {
    explicitAny: { 'src/legacy.ts': 1 },
    typeScriptSuppressions: {},
    nonNullAssertions: {},
    frontendRawFetch: {},
  },
};

const functionSize = {
  version: 1,
  defaultMaxLines: 120,
  exceptions: { 'src/legacy.ts#legacyFunction': 180 },
};

function file(file, lines, metrics = {}) {
  return {
    file,
    lines,
    metrics: {
      explicitAny: 0,
      typeScriptSuppressions: 0,
      nonNullAssertions: 0,
      frontendRawFetch: 0,
      ...metrics,
    },
    parseDiagnostics: [],
  };
}

function snapshot(files, functions = []) {
  return { files, functions };
}

function evaluate(current, options = {}) {
  return evaluateCleanCodeSnapshot(current, {
    baseline,
    sourceDebtRegistry: sourceDebt,
    functionSizeRegistry: functionSize,
    scope: { mode: 'full' },
    today: '2026-08-28',
    ...options,
  });
}

test('legacy files pass unchanged or reduced and fail when their line budget grows', () => {
  assert.equal(evaluate(snapshot([file('src/legacy.ts', 300)])).status, 'pass');
  assert.equal(evaluate(snapshot([file('src/legacy.ts', 299)])).status, 'pass');

  const report = evaluate(snapshot([file('src/legacy.ts', 301)]));
  assert.equal(report.status, 'fail');
  assert.deepEqual(report.violations.map(entry => entry.id), ['file-lines:src/legacy.ts']);
});

test('new files use the hard line limit', () => {
  assert.equal(evaluate(snapshot([file('src/new.ts', 250)])).status, 'pass');

  const report = evaluate(snapshot([file('src/new.ts', 251)]));
  assert.equal(report.status, 'fail');
  assert.equal(report.violations[0].maximum, 250);
});

test('source debt and function budgets remain per-file ratchets', () => {
  const current = snapshot(
    [file('src/legacy.ts', 300, { explicitAny: 2 })],
    [{ file: 'src/legacy.ts', name: 'legacyFunction', lines: 181 }],
  );
  const report = evaluate(current);

  assert.deepEqual(report.violations.map(entry => entry.id), [
    'function-lines:src/legacy.ts#legacyFunction',
    'source-debt:explicitAny:src/legacy.ts',
  ]);
});

test('renamed files inherit the old path budgets in changed scope', () => {
  const current = snapshot(
    [file('src/renamed.ts', 300, { explicitAny: 1 })],
    [{ file: 'src/renamed.ts', name: 'legacyFunction', lines: 180 }],
  );
  const report = evaluate(current, {
    scope: {
      mode: 'changed',
      files: [{ file: 'src/renamed.ts', baselineFile: 'src/legacy.ts' }],
    },
  });

  assert.equal(report.status, 'pass');
  assert.equal(report.files[0].baselineFile, 'src/legacy.ts');
});

test('active exceptions suppress exact stable IDs and expired exceptions fail closed', () => {
  const exception = {
    id: 'file-lines:src/new.ts',
    owner: 'platform',
    reason: 'Temporary generated compatibility facade',
    expires: '2026-09-30',
  };
  const active = evaluate(snapshot([file('src/new.ts', 251)]), {
    baseline: { ...baseline, exceptions: [exception] },
  });
  assert.equal(active.status, 'pass');
  assert.deepEqual(active.suppressed.map(entry => entry.id), ['file-lines:src/new.ts']);

  assert.throws(
    () => evaluate(snapshot([file('src/new.ts', 251)]), {
      baseline: { ...baseline, exceptions: [{ ...exception, expires: '2026-08-27' }] },
    }),
    /expired clean-code exception/,
  );
});

test('malformed baselines fail closed', () => {
  assert.throws(
    () => validateCleanCodeBaseline(baseline),
    /requires an injected YYYY-MM-DD date/,
  );
  assert.throws(
    () => validateCleanCodeBaseline({ ...baseline, schemaVersion: 2 }, '2026-08-28'),
    /schemaVersion must be 1/,
  );
  assert.throws(
    () => validateCleanCodeBaseline({
      ...baseline,
      legacy: { fileLines: { '../escape.ts': 300 } },
    }, '2026-08-28'),
    /unsafe baseline path/,
  );
});

test('parse diagnostics are blocking violations', () => {
  const broken = file('src/broken.ts', 2);
  broken.parseDiagnostics.push({ code: 1005, line: 2, character: 1, message: "'}' expected" });
  const report = evaluate(snapshot([broken]));

  assert.equal(report.status, 'fail');
  assert.deepEqual(report.violations.map(entry => entry.id), ['parse:src/broken.ts:2:1:1005']);
});

test('module scope evaluates only files under the requested prefix', () => {
  const current = snapshot([
    file('src/modules/cards/new.ts', 251),
    file('src/features/ignored.ts', 999),
  ]);
  const report = evaluate(current, {
    scope: { mode: 'module', module: 'src/modules/cards' },
  });

  assert.deepEqual(report.files.map(entry => entry.file), ['src/modules/cards/new.ts']);
  assert.deepEqual(report.violations.map(entry => entry.id), ['file-lines:src/modules/cards/new.ts']);
});

test('baseline candidates accept reductions but reject new or growing legacy debt', () => {
  const reduced = createCleanCodeBaselineCandidate(
    snapshot([file('src/legacy.ts', 280)]),
    baseline,
    '2026-08-28',
  );
  assert.equal(reduced.canAccept, true);
  assert.deepEqual(reduced.baseline.legacy.fileLines, { 'src/legacy.ts': 280 });

  const grown = createCleanCodeBaselineCandidate(
    snapshot([file('src/legacy.ts', 301), file('src/new.ts', 251)]),
    baseline,
    '2026-08-28',
  );
  assert.equal(grown.canAccept, false);
  assert.deepEqual(grown.increases.map(entry => entry.id), [
    'file-lines:src/legacy.ts',
    'file-lines:src/new.ts',
  ]);
});

test('JSON and Markdown reports are deterministic and contain stable IDs', () => {
  const report = evaluate(snapshot([file('src/new.ts', 251)]));
  const first = renderCleanCodeReport(report, 'json');
  const second = renderCleanCodeReport(report, 'json');

  assert.equal(first, second);
  assert.match(first, /file-lines:src\/new\.ts/);
  assert.match(renderCleanCodeReport(report, 'markdown'), /`file-lines:src\/new\.ts`/);
  assert.match(renderCleanCodeReport(report, 'human'), /FAIL.*file-lines:src\/new\.ts/s);
});

test('changed-file discovery preserves rename ancestry and ignores vendored TypeScript', () => {
  const repository = mkdtempSync(path.join(tmpdir(), 'hearthpulse-clean-code-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    mkdirSync(path.join(repository, 'src', 'vendor'), { recursive: true });
    writeFileSync(path.join(repository, 'src', 'legacy.ts'), 'export const legacy = true;\n');
    git('init', '-q');
    git('config', 'user.email', 'clean-code@example.invalid');
    git('config', 'user.name', 'Clean Code Test');
    git('add', '.');
    git('commit', '-qm', 'baseline');
    const base = git('rev-parse', 'HEAD');

    renameSync(path.join(repository, 'src', 'legacy.ts'), path.join(repository, 'src', 'renamed.ts'));
    writeFileSync(path.join(repository, 'src', 'new.ts'), 'export const added = true;\n');
    writeFileSync(path.join(repository, 'src', 'vendor', 'ignored.ts'), 'const vendored = true;\n');
    mkdirSync(path.join(repository, 'scripts', 'clean-code'), { recursive: true });
    writeFileSync(path.join(repository, 'scripts', 'clean-code', 'new.mjs'), 'export const gate = true;\n');
    git('add', '-A');

    assert.deepEqual(changedFileMappings(base, repository), [
      { file: 'scripts/clean-code/new.mjs', baselineFile: 'scripts/clean-code/new.mjs' },
      { file: 'src/new.ts', baselineFile: 'src/new.ts' },
      { file: 'src/renamed.ts', baselineFile: 'src/legacy.ts' },
    ]);
    assert.equal(isAuthoredTypeScript('src/vendor/ignored.ts'), false);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test('clean-code tooling modules are authored source while unrelated scripts stay excluded', () => {
  for (const fileName of ['example.js', 'example.mjs', 'example.cjs', 'example.ts', 'example.mts', 'example.cts']) {
    assert.equal(isAuthoredTypeScript(`scripts/clean-code/${fileName}`), true, fileName);
  }
  assert.equal(isAuthoredTypeScript('scripts/release.mjs'), false);
  assert.equal(isAuthoredTypeScript('scripts/clean-code/vendor/copied.mjs'), false);
});

test('tooling snapshot enforces file, function and parse rules deterministically', () => {
  const repository = mkdtempSync(path.join(tmpdir(), 'hearthpulse-clean-code-tooling-'));
  const toolingDirectory = path.join(repository, 'scripts', 'clean-code');
  try {
    mkdirSync(toolingDirectory, { recursive: true });
    const functionLines = [
      'export function oversized() {',
      ...Array.from({ length: 119 }, (_, index) => `  const value${index} = ${index};`),
      '}',
    ];
    const source = [
      ...functionLines,
      ...Array.from({ length: 130 }, (_, index) => `// padding ${index}`),
    ].join('\n');
    writeFileSync(path.join(toolingDirectory, 'oversized.mjs'), source);

    const first = collectCleanCodeSnapshot(repository);
    const second = collectCleanCodeSnapshot(repository);
    assert.deepEqual(first, second);
    assert.equal(first.files[0].file, 'scripts/clean-code/oversized.mjs');
    assert.equal(first.files[0].lines, 251);

    const report = evaluateCleanCodeSnapshot(first, {
      baseline: { ...baseline, legacy: { fileLines: {} } },
      sourceDebtRegistry: {
        ...sourceDebt,
        budgets: Object.fromEntries(Object.keys(sourceDebt.budgets).map(metric => [metric, {}])),
      },
      functionSizeRegistry: { ...functionSize, exceptions: {} },
      scope: { mode: 'full' },
      today: '2026-08-28',
    });
    assert.deepEqual(report.violations.map(entry => entry.id), [
      'file-lines:scripts/clean-code/oversized.mjs',
      'function-lines:scripts/clean-code/oversized.mjs#oversized',
    ]);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test('clean-code runtime modules have no internal import cycles or test dependencies', () => {
  const repositoryRoot = path.resolve(import.meta.dirname, '..');
  const moduleDirectory = path.join(repositoryRoot, 'scripts', 'clean-code');
  const modules = readdirSync(moduleDirectory)
    .filter(fileName => fileName.endsWith('.mjs'))
    .map(fileName => `scripts/clean-code/${fileName}`)
    .sort();
  const moduleSet = new Set(modules);
  const graph = new Map(modules.map(fileName => [fileName, []]));
  for (const fileName of modules) {
    const source = readFileSync(path.join(repositoryRoot, fileName), 'utf8');
    for (const entry of analyzeSourceMetrics(fileName, source).imports) {
      assert.doesNotMatch(entry.specifier, /(?:^|\/)tests?(?:\/|$)/);
      if (!entry.specifier.startsWith('.')) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(fileName), entry.specifier));
      if (moduleSet.has(target)) graph.get(fileName).push(target);
    }
  }
  const visited = new Set();
  const active = new Set();
  const visit = fileName => {
    assert.equal(active.has(fileName), false, `clean-code import cycle reaches ${fileName}`);
    if (visited.has(fileName)) return;
    active.add(fileName);
    for (const target of graph.get(fileName)) visit(target);
    active.delete(fileName);
    visited.add(fileName);
  };
  for (const fileName of modules) visit(fileName);
});

function gitRepository() {
  const repository = mkdtempSync(path.join(tmpdir(), 'hearthpulse-clean-code-git-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  mkdirSync(path.join(repository, 'src'), { recursive: true });
  mkdirSync(path.join(repository, 'docs'), { recursive: true });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'clean-code@example.invalid');
  git('config', 'user.name', 'Clean Code Test');
  writeFileSync(path.join(repository, 'src', 'base.ts'), 'export const base = true;\n');
  git('add', '.');
  git('commit', '-qm', 'base');
  git('remote', 'add', 'origin', repository);
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  return { repository, git };
}

test('push scope checks the complete before-to-head range', () => {
  const { repository, git } = gitRepository();
  try {
    const before = git('rev-parse', 'HEAD');
    writeFileSync(path.join(repository, 'src', 'first.ts'), 'export const first = true;\n');
    git('add', '.');
    git('commit', '-qm', 'first product commit');
    writeFileSync(path.join(repository, 'src', 'second.ts'), 'export const second = true;\n');
    git('add', '.');
    git('commit', '-qm', 'second product commit');

    const scope = resolveCleanCodeScope({
      repositoryRoot: repository,
      env: {
        GITHUB_ACTIONS: 'true',
        CLEAN_CODE_EVENT: 'push',
        CLEAN_CODE_PUSH_BEFORE: before,
      },
    });

    assert.equal(scope.base, before);
    assert.equal(scope.head, git('rev-parse', 'HEAD'));
    assert.equal(scope.baseSource, 'push-before');
    assert.notEqual(scope.base, scope.head);
    assert.deepEqual(scope.files.map(entry => entry.file), ['src/first.ts', 'src/second.ts']);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test('docs-only pushes prove an empty authored diff without using HEAD as base', () => {
  const { repository, git } = gitRepository();
  try {
    const before = git('rev-parse', 'HEAD');
    writeFileSync(path.join(repository, 'docs', 'note.md'), '# Documentation only\n');
    git('add', '.');
    git('commit', '-qm', 'docs only');

    const scope = resolveCleanCodeScope({
      repositoryRoot: repository,
      env: { CLEAN_CODE_EVENT: 'push', CLEAN_CODE_PUSH_BEFORE: before },
    });

    assert.equal(scope.mode, 'changed');
    assert.equal(scope.base, before);
    assert.notEqual(scope.base, scope.head);
    assert.deepEqual(scope.files, []);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test('unprovable CI bases fall back to full scope and explicit invalid bases fail', () => {
  const { repository, git } = gitRepository();
  try {
    const head = git('rev-parse', 'HEAD');
    for (const env of [
      { CLEAN_CODE_EVENT: 'push', CLEAN_CODE_PUSH_BEFORE: '0'.repeat(40) },
      { CLEAN_CODE_EVENT: 'push', CLEAN_CODE_PUSH_BEFORE: head },
      { CLEAN_CODE_EVENT: 'workflow_dispatch' },
    ]) {
      const scope = resolveCleanCodeScope({ repositoryRoot: repository, env });
      assert.equal(scope.mode, 'full');
      assert.equal(scope.base, null);
      assert.equal(scope.head, head);
      assert.match(scope.baseSource, /full-fallback$/);
    }

    assert.throws(
      () => resolveCleanCodeScope({
        repositoryRoot: repository,
        env: { CLEAN_CODE_BASE: 'missing-base' },
      }),
      /explicit clean-code base.*missing-base/i,
    );
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test('pull requests, dispatch inputs and local branches expose their base source', () => {
  const { repository, git } = gitRepository();
  try {
    const base = git('rev-parse', 'HEAD');
    git('switch', '-qc', 'feature');
    writeFileSync(path.join(repository, 'src', 'feature.ts'), 'export const feature = true;\n');
    git('add', '.');
    git('commit', '-qm', 'feature');

    const pullRequest = resolveCleanCodeScope({
      repositoryRoot: repository,
      env: { CLEAN_CODE_EVENT: 'pull_request', CLEAN_CODE_PR_BASE_SHA: base },
    });
    assert.equal(pullRequest.baseSource, 'pull-request');
    assert.deepEqual(pullRequest.files.map(entry => entry.file), ['src/feature.ts']);

    const dispatch = resolveCleanCodeScope({
      repositoryRoot: repository,
      env: { CLEAN_CODE_EVENT: 'workflow_dispatch', CLEAN_CODE_DISPATCH_BASE: base },
    });
    assert.equal(dispatch.baseSource, 'workflow-dispatch');

    const local = resolveCleanCodeScope({ repositoryRoot: repository, env: {} });
    assert.equal(local.baseSource, 'local-merge-base');
    assert.equal(local.base, base);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test('rename migration moves and reduces every path-keyed registry and exception ID', () => {
  const activeException = {
    id: 'source-debt:explicitAny:src/legacy.ts',
    owner: 'platform',
    reason: 'Temporary compatibility type',
    expires: '2026-09-30',
  };
  const plan = createBudgetMigration({
    snapshot: snapshot(
      [file('src/renamed.ts', 280, { explicitAny: 1 })],
      [{ file: 'src/renamed.ts', name: 'legacyFunction', lines: 160 }],
    ),
    baseline: { ...baseline, exceptions: [activeException] },
    sourceDebtRegistry: sourceDebt,
    functionSizeRegistry: functionSize,
    mappings: [{ file: 'src/renamed.ts', baselineFile: 'src/legacy.ts' }],
    today: '2026-08-28',
  });

  assert.equal(plan.canAccept, true);
  assert.deepEqual(plan.violations, []);
  assert.deepEqual(plan.baseline.legacy.fileLines, { 'src/renamed.ts': 280 });
  assert.deepEqual(plan.sourceDebtRegistry.budgets.explicitAny, { 'src/renamed.ts': 1 });
  assert.deepEqual(plan.functionSizeRegistry.exceptions, {
    'src/renamed.ts#legacyFunction': 160,
  });
  assert.equal(plan.baseline.exceptions[0].id, 'source-debt:explicitAny:src/renamed.ts');
  assert.equal(JSON.stringify(plan), JSON.stringify(createBudgetMigration({
    snapshot: snapshot(
      [file('src/renamed.ts', 280, { explicitAny: 1 })],
      [{ file: 'src/renamed.ts', name: 'legacyFunction', lines: 160 }],
    ),
    baseline: { ...baseline, exceptions: [activeException] },
    sourceDebtRegistry: sourceDebt,
    functionSizeRegistry: functionSize,
    mappings: [{ file: 'src/renamed.ts', baselineFile: 'src/legacy.ts' }],
    today: '2026-08-28',
  })));
});

test('rename migration rejects growth and destination conflicts', () => {
  const growth = createBudgetMigration({
    snapshot: snapshot(
      [file('src/renamed.ts', 301, { explicitAny: 2 })],
      [{ file: 'src/renamed.ts', name: 'legacyFunction', lines: 181 }],
    ),
    baseline,
    sourceDebtRegistry: sourceDebt,
    functionSizeRegistry: functionSize,
    mappings: [{ file: 'src/renamed.ts', baselineFile: 'src/legacy.ts' }],
    today: '2026-08-28',
  });
  assert.equal(growth.canAccept, false);
  assert.deepEqual(growth.violations.map(entry => entry.id), [
    'file-lines:src/renamed.ts',
    'function-lines:src/renamed.ts#legacyFunction',
    'source-debt:explicitAny:src/renamed.ts',
  ]);

  const conflict = createBudgetMigration({
    snapshot: snapshot([file('src/renamed.ts', 280)]),
    baseline: {
      ...baseline,
      legacy: { fileLines: { ...baseline.legacy.fileLines, 'src/renamed.ts': 290 } },
    },
    sourceDebtRegistry: sourceDebt,
    functionSizeRegistry: functionSize,
    mappings: [{ file: 'src/renamed.ts', baselineFile: 'src/legacy.ts' }],
    today: '2026-08-28',
  });
  assert.equal(conflict.canAccept, false);
  assert.match(conflict.violations[0].id, /^rename-conflict:/);
});

test('real Git rename lifecycle survives baseline acceptance and blocks later growth', () => {
  const { repository, git } = gitRepository();
  const configDirectory = path.join(repository, 'config');
  const oldPath = path.join(repository, 'src', 'base.ts');
  const newPath = path.join(repository, 'src', 'renamed.ts');
  const lines = Array.from({ length: 300 }, (_, index) => `export const line${index} = ${index};`);
  try {
    mkdirSync(configDirectory, { recursive: true });
    writeFileSync(oldPath, `${lines.join('\n')}\n`);
    git('add', '.');
    git('commit', '-qm', 'large legacy source');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    const renameBase = git('rev-parse', 'HEAD');

    const repositoryBaseline = {
      ...baseline,
      legacy: { fileLines: { 'src/base.ts': 300 } },
    };
    const repositoryDebt = {
      ...sourceDebt,
      budgets: { ...sourceDebt.budgets, explicitAny: { 'src/base.ts': 1 } },
    };
    const repositoryFunctions = {
      ...functionSize,
      exceptions: { 'src/base.ts#legacyFunction': 180 },
    };
    writeFileSync(path.join(configDirectory, 'clean-code-baseline.json'), `${JSON.stringify(repositoryBaseline, null, 2)}\n`);
    writeFileSync(path.join(configDirectory, 'source-debt-budgets.json'), `${JSON.stringify(repositoryDebt, null, 2)}\n`);
    writeFileSync(path.join(configDirectory, 'function-size-budgets.json'), `${JSON.stringify(repositoryFunctions, null, 2)}\n`);

    renameSync(oldPath, newPath);
    writeFileSync(newPath, `${lines.slice(0, 280).join('\n')}\n`);
    git('add', '-A');
    const mappings = changedFileMappings(renameBase, repository);
    assert.deepEqual(mappings, [{ file: 'src/renamed.ts', baselineFile: 'src/base.ts' }]);

    const current = snapshot(
      [file('src/renamed.ts', 280, { explicitAny: 1 })],
      [{ file: 'src/renamed.ts', name: 'legacyFunction', lines: 160 }],
    );
    const plan = createBudgetMigration({
      snapshot: current,
      baseline: repositoryBaseline,
      sourceDebtRegistry: repositoryDebt,
      functionSizeRegistry: repositoryFunctions,
      mappings,
      today: '2026-08-28',
    });
    const beforePreview = readFileSync(path.join(configDirectory, 'clean-code-baseline.json'), 'utf8');
    assert.equal(plan.canAccept, true);
    assert.equal(readFileSync(path.join(configDirectory, 'clean-code-baseline.json'), 'utf8'), beforePreview);

    acceptBudgetMigration(repository, plan);
    const acceptedBaseline = JSON.parse(readFileSync(path.join(configDirectory, 'clean-code-baseline.json'), 'utf8'));
    const acceptedDebt = JSON.parse(readFileSync(path.join(configDirectory, 'source-debt-budgets.json'), 'utf8'));
    const acceptedFunctions = JSON.parse(readFileSync(path.join(configDirectory, 'function-size-budgets.json'), 'utf8'));
    assert.deepEqual(acceptedBaseline.legacy.fileLines, { 'src/renamed.ts': 280 });
    assert.deepEqual(acceptedDebt.budgets.explicitAny, { 'src/renamed.ts': 1 });
    assert.deepEqual(acceptedFunctions.exceptions, { 'src/renamed.ts#legacyFunction': 160 });

    git('add', '.');
    git('commit', '-qm', 'accept renamed budgets');
    writeFileSync(newPath, `${['export const changed = true;', ...lines.slice(1, 280)].join('\n')}\n`);
    assert.equal(evaluateCleanCodeSnapshot(current, {
      baseline: acceptedBaseline,
      sourceDebtRegistry: acceptedDebt,
      functionSizeRegistry: acceptedFunctions,
      scope: { mode: 'full' },
      today: '2026-08-28',
    }).status, 'pass');

    const grown = snapshot(
      [file('src/renamed.ts', 281, { explicitAny: 1 })],
      [{ file: 'src/renamed.ts', name: 'legacyFunction', lines: 160 }],
    );
    assert.deepEqual(evaluateCleanCodeSnapshot(grown, {
      baseline: acceptedBaseline,
      sourceDebtRegistry: acceptedDebt,
      functionSizeRegistry: acceptedFunctions,
      scope: { mode: 'full' },
      today: '2026-08-28',
    }).violations.map(entry => entry.id), ['file-lines:src/renamed.ts']);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
