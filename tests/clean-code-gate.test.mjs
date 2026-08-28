import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  changedFileMappings,
  isAuthoredTypeScript,
} from '../scripts/clean-code/cli.mjs';
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
  );
  assert.equal(reduced.canAccept, true);
  assert.deepEqual(reduced.baseline.legacy.fileLines, { 'src/legacy.ts': 280 });

  const grown = createCleanCodeBaselineCandidate(
    snapshot([file('src/legacy.ts', 301), file('src/new.ts', 251)]),
    baseline,
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
    git('add', '-A');

    assert.deepEqual(changedFileMappings(base, repository), [
      { file: 'src/new.ts', baselineFile: 'src/new.ts' },
      { file: 'src/renamed.ts', baselineFile: 'src/legacy.ts' },
    ]);
    assert.equal(isAuthoredTypeScript('src/vendor/ignored.ts'), false);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
