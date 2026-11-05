import assert from 'node:assert/strict';
import test from 'node:test';
import { planTestWorkers, runTestWorkers } from '../scripts/run-test-workers.mjs';
import { credentialBackendArguments } from './helpers/credentialBackend.mjs';

test('workers partition the full matrix into disjoint global shards and separate reports', () => {
  const all = [];
  for (let shard = 1; shard <= 10; shard += 1) {
    const plans = planTestWorkers(['--suite', 'browser', '--shard', `${shard}/10`, '--workers', '2', '--report-dir', '/tmp/timings', '--continue-on-failure', '--only-files', 'selected.json']);
    for (const args of plans) {
      all.push(args[args.indexOf('--shard') + 1]);
      assert.ok(args.includes('--continue-on-failure'));
      assert.equal(args[args.indexOf('--only-files') + 1], 'selected.json');
    }
    assert.notEqual(plans[0].at(-1), plans[1].at(-1));
  }
  assert.deepEqual(all.toSorted((a, b) => parseInt(a) - parseInt(b)), Array.from({ length: 20 }, (_, i) => `${i + 1}/20`));
  const striped = planTestWorkers(['--suite', 'browser', '--shard', '1/10', '--workers', '4', '--report-dir', '/tmp/timings']);
  assert.deepEqual(striped.map(args => args[args.indexOf('--shard') + 1]), ['1/40', '11/40', '21/40', '31/40'],
    'the longest global shards must start in different physical jobs');
});

test('worker CLI rejects missing, duplicate or unsafe limits before spawning', () => {
  const base = ['--suite', 'unit', '--shard', '1/2', '--report-dir', '/tmp/timings'];
  for (const limit of ['0', '-1', '1.5', '5', 'abc']) {
    assert.throws(() => planTestWorkers([...base, '--workers', limit]));
  }
  assert.throws(() => planTestWorkers(['--suite', 'unit', '--workers', '2']));
  assert.throws(() => planTestWorkers([...base, '--workers', '2', '--workers', '2']));
});

test('compiled fixtures keep controlled transport and source execution remains the standalone default', () => {
  assert.deepEqual(credentialBackendArguments(), ['--import', 'tsx', 'server/index.ts']);
  assert.deepEqual(credentialBackendArguments({ compiled: true, externalOrigin: true }), [
    '--import', './tests/helpers/controlledExternalFetch.mjs', 'build/server/index.js',
  ]);
});

test('a failed worker cannot hide the result or leave its sibling running', async () => {
  let release;
  let calls = 0;
  let finished = false;
  const execute = (_command, _args, { environment }) => {
    assert.equal(environment.HP_TEST_COMPILED_BACKEND, '1');
    assert.equal(environment.PRODUCTION_SCRAPER_BUILD_READY, '1', 'workers must not rebuild shared artifacts');
    return ++calls === 1 ? Promise.reject(new Error('worker failed'))
      : new Promise(resolve => { release = resolve; });
  };
  const run = runTestWorkers(['--suite', 'unit', '--shard', '1/1', '--workers', '2', '--report-dir', '/tmp/timings'], { execute });
  run.catch(() => { finished = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(finished, false);
  release();
  await assert.rejects(run, /worker failed/);
});

test('browser warmup finishes before workers start and is never forwarded to test files', async () => {
  const args = ['--suite', 'browser', '--shard', '1/10', '--workers', '4', '--report-dir', '/tmp/timings', '--warmup-browser'];
  const events = [];
  let release;
  const run = runTestWorkers(args, {
    environment: { CHROMIUM_PATH: '/test/chrome' },
    warmBrowser: async environment => {
      assert.equal(environment.CHROMIUM_PATH, '/test/chrome');
      events.push('warmup');
      await new Promise(resolve => { release = resolve; });
      events.push('closed');
    },
    execute: async (_command, flags) => {
      assert.ok(!flags.includes('--warmup-browser'));
      events.push('worker');
    },
  });
  // Observe an early failure too, without turning it into an unhandled rejection.
  run.catch(() => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['warmup']);
  release();
  await run;
  assert.deepEqual(events, ['warmup', 'closed', 'worker', 'worker', 'worker', 'worker']);
});

test('warmup failure prevents worker execution; default runs do not warm a browser', async () => {
  const args = ['--suite', 'browser', '--shard', '1/1', '--workers', '2', '--report-dir', '/tmp/timings'];
  let calls = 0;
  const hooks = {
    environment: {},
    warmBrowser: async () => { throw new Error('browser unavailable'); },
    execute: async () => { calls += 1; },
  };
  await assert.rejects(runTestWorkers([...args, '--warmup-browser'], hooks), /browser unavailable/);
  assert.equal(calls, 0);
  await runTestWorkers(args, hooks);
  assert.equal(calls, 2);
  assert.throws(() => planTestWorkers([...args, '--warmup-browser', '--warmup-browser']));
  assert.throws(() => planTestWorkers(['--suite', 'unit', ...args.slice(2), '--warmup-browser']));
});
