import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  APPROVAL_DIR, BASELINE_DIR, POLICY_PATH, budgetLimits, evaluateBudgets, loadBudgetConfig, normalizeAsset,
  normalizedGzipBytes, refreshBaselines, routeSlug, toleranceBytes,
} from '../scripts/next-bundle-budgets.mjs';

function fixture({ approvals = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'next-budgets-'));
  mkdirSync(join(root, BASELINE_DIR), { recursive: true });
  mkdirSync(join(root, APPROVAL_DIR), { recursive: true });
  writeFileSync(join(root, POLICY_PATH), JSON.stringify({ schemaVersion: 2, tolerance: { ratio: 0.02, minBytes: 1024 } }));
  writeFileSync(join(root, BASELINE_DIR, 'home.json'), JSON.stringify({ route: '/', jsGzipBytes: 100_000, cssGzipBytes: 20_000 }));
  writeFileSync(join(root, BASELINE_DIR, 'standard--meta.json'),
    JSON.stringify({ route: '/standard/meta/', jsGzipBytes: 150_000, cssGzipBytes: 40_000 }));
  for (const [name, data] of Object.entries(approvals)) writeFileSync(join(root, APPROVAL_DIR, name), JSON.stringify(data));
  return root;
}

test('the committed budget policy, baselines and approvals are valid', () => {
  const config = loadBudgetConfig();
  assert.deepEqual(config.errors, []);
  assert.ok(Object.keys(config.baselines).length >= 20, 'every public route keeps a baseline');
});

test('release SHA and chunk hashes do not change the measured size', () => {
  const local = 'a.d(s,{releaseId:"development",x:"static/chunks/8102-0123456789abcdef.js"})';
  const ci = 'a.d(s,{releaseId:"3f9c2a7d41be08e5c6a9f1d2b7e40c83a5d9f6e1",x:"static/chunks/8102-fedcba9876543210.js"})';
  assert.equal(normalizeAsset(local), normalizeAsset(ci));
  assert.equal(normalizedGzipBytes(local), normalizedGzipBytes(ci));
  assert.equal(normalizeAsset('color:"#0123456789"'), 'color:"#0123456789"', 'short hex values stay untouched');
});

test('route slugs are stable file names', () => {
  assert.equal(routeSlug('/'), 'home');
  assert.equal(routeSlug('/standard/cards/standard/'), 'standard--cards--standard');
});

test('the limit is baseline plus tolerance plus approvals', () => {
  assert.equal(toleranceBytes(100_000, { ratio: 0.02, minBytes: 1024 }), 2000);
  assert.equal(toleranceBytes(20_000, { ratio: 0.02, minBytes: 1024 }), 1024);
  const config = loadBudgetConfig(fixture({
    approvals: { 'meta-chart.json': { reason: 'Graph library for the meta chart', routes: { '/standard/meta/': { jsGzipBytes: 5000 } } } },
  }));
  assert.deepEqual(config.errors, []);
  assert.deepEqual(budgetLimits(config), {
    '/': { jsGzipBytes: 102_000, cssGzipBytes: 21_024 },
    '/standard/meta/': { jsGzipBytes: 158_000, cssGzipBytes: 41_024 },
  });
});

test('growth above the tolerance fails until an approval file covers it', () => {
  const measured = { '/': { jsGzipBytes: 102_001, cssGzipBytes: 20_000 }, '/standard/meta/': { jsGzipBytes: 150_000, cssGzipBytes: 40_000 } };
  const { failures } = evaluateBudgets({ ...loadBudgetConfig(fixture()), measured });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^\/ jsGzipBytes: 102001 > 102000 .*approve at least 1 B/);

  const approved = loadBudgetConfig(fixture({ approvals: { 'home.json': { reason: 'Approved homepage feature', routes: { '/': { jsGzipBytes: 1 } } } } }));
  assert.deepEqual(evaluateBudgets({ ...approved, measured }).failures, []);
  assert.match(evaluateBudgets({ ...approved, measured: { '/': measured['/'] } }).failures[0], /standard\/meta\/: not measured/);
});

test('invalid approvals and baselines are reported', () => {
  const config = loadBudgetConfig(fixture({
    approvals: {
      'bad.json': { reason: 'short', routes: { '/missing/': { jsGzipBytes: 10 }, '/': { jsGzipBytes: -1, imageBytes: 5 } } },
    },
  }));
  assert.deepEqual(config.errors, [
    `${APPROVAL_DIR}/bad.json: reason must explain the growth (at least 10 characters)`,
    `${APPROVAL_DIR}/bad.json: /missing/ has no baseline`,
    `${APPROVAL_DIR}/bad.json: / jsGzipBytes must be a positive integer`,
    `${APPROVAL_DIR}/bad.json: / has unknown key imageBytes`,
  ]);
  const root = fixture();
  writeFileSync(join(root, BASELINE_DIR, 'wrong.json'), JSON.stringify({ route: '/faq/', jsGzipBytes: 1, cssGzipBytes: 1 }));
  assert.deepEqual(loadBudgetConfig(root).errors, [`${BASELINE_DIR}/wrong.json: file name must be faq.json`]);
});

test('a baseline refresh adopts the main measurement and retires only approvals it contains', () => {
  const root = fixture({
    approvals: {
      'merged.json': { reason: 'Already part of main', routes: { '/': { jsGzipBytes: 4000 } } },
      'later.json': { reason: 'Merged after the measured commit', routes: { '/': { jsGzipBytes: 1000 } } },
    },
  });
  const report = {
    commit: 'a'.repeat(40),
    routes: { '/': { jsGzipBytes: 105_500, cssGzipBytes: 20_100 }, '/standard/meta/': { jsGzipBytes: 149_000, cssGzipBytes: 40_000 } },
  };
  const { written, removed } = refreshBaselines({ report, root, approvalsAtCommit: new Set([`${APPROVAL_DIR}/merged.json`]) });
  assert.deepEqual(written, [`${BASELINE_DIR}/home.json`, `${BASELINE_DIR}/standard--meta.json`]);
  assert.deepEqual(removed, [`${APPROVAL_DIR}/merged.json`]);
  assert.deepEqual(readdirSync(join(root, APPROVAL_DIR)), ['later.json']);
  assert.deepEqual(JSON.parse(readFileSync(join(root, BASELINE_DIR, 'home.json'), 'utf8')),
    { route: '/', jsGzipBytes: 105_500, cssGzipBytes: 20_100, measuredAt: 'a'.repeat(40) });
});
