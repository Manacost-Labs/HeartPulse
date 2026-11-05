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
  assert.deepEqual(all, Array.from({ length: 20 }, (_, i) => `${i + 1}/20`));
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
