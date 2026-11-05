import assert from 'node:assert/strict';
import test from 'node:test';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { planTestWorkers, runTestWorkers } from '../scripts/run-test-workers.mjs';
import { startWarmupDiagnostics } from '../scripts/lib/browser-warmup-diagnostics.mjs';
import { preloadBrowserExecutable } from '../scripts/lib/browser-preload.mjs';
import { credentialBackendArguments } from './helpers/credentialBackend.mjs';

test('workers partition the full matrix into disjoint global shards and separate reports', () => {
  for (const [jobs, workers] of [[10, 2], [12, 4]]) {
    const all = [];
    for (let shard = 1; shard <= jobs; shard += 1) {
      const plans = planTestWorkers(['--suite', 'browser', '--shard', `${shard}/${jobs}`, '--workers', String(workers), '--report-dir', '/tmp/timings', '--continue-on-failure', '--only-files', 'selected.json']);
      for (const args of plans) {
        all.push(args[args.indexOf('--shard') + 1]);
        assert.ok(args.includes('--continue-on-failure'));
        assert.equal(args[args.indexOf('--only-files') + 1], 'selected.json');
      }
      assert.equal(new Set(plans.map(args => args.at(-1))).size, workers);
    }
    const total = jobs * workers;
    assert.deepEqual(all.toSorted((a, b) => parseInt(a) - parseInt(b)), Array.from({ length: total }, (_, i) => `${i + 1}/${total}`));
  }
  const striped = planTestWorkers(['--suite', 'browser', '--shard', '1/12', '--workers', '4', '--report-dir', '/tmp/timings']);
  assert.deepEqual(striped.map(args => args[args.indexOf('--shard') + 1]), ['1/48', '13/48', '25/48', '37/48'],
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

test('warmup diagnostics expose only counters and stop without touching the child', { skip: process.platform !== 'linux' }, async () => {
  const secret = 'warmup-private-sentinel';
  const child = fork('-e', ['process.send("ready"); setInterval(() => {}, 1000)', secret], {
    env: { ...process.env, WARMUP_PRIVATE_SENTINEL: secret }, silent: true,
  });
  let stop = () => {};
  const messages = [];
  try {
    await once(child, 'message', { signal: AbortSignal.timeout(5000) });
    const snapshot = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('warmup child snapshot missing')), 2000);
      stop = startWarmupDiagnostics({ intervalMs: 10, emit: line => {
        messages.push(line);
        const record = JSON.parse(line.slice('[browser-warmup] '.length));
        const ownChild = record.children.find(entry => entry.pid === child.pid);
        if (ownChild) { clearTimeout(timeout); resolve(ownChild); }
      } });
    });
    stop();
    const count = messages.length;
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(messages.length, count, 'sampling cannot leak into later test workers');
    assert.ok(!messages.join('\n').includes(secret), 'arguments and environment stay private');
    assert.deepEqual(Object.keys(snapshot).sort(), ['mainThreadCpuMs', 'mainThreadRunQueueMs', 'pid', 'readBytes', 'state', 'waitChannel']);
    assert.ok(Number.isFinite(snapshot.mainThreadCpuMs) && snapshot.mainThreadCpuMs >= 0);
    assert.ok(Number.isFinite(snapshot.readBytes) && snapshot.readBytes >= 0);
    assert.equal(child.exitCode, null, 'observing a child does not stop it');
  } finally {
    stop();
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close');
      child.kill('SIGKILL');
      await closed;
    }
  }
});

test('browser preload reads the exact ELF through a Google wrapper without modifying or executing files', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hp-browser-preload-'));
  try {
    const executable = path.join(directory, 'chrome');
    const bytes = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(2 * 1024 * 1024, 42)]);
    await writeFile(executable, bytes);
    await writeFile(path.join(directory, 'google-chrome'), 'this wrapper must not execute');
    await symlink(path.join(directory, 'google-chrome'), path.join(directory, 'launcher'));
    for (const name of ['chrome', 'launcher']) {
      const result = await preloadBrowserExecutable(path.join(directory, name));
      assert.equal(result.outcome, 'ready');
      assert.equal(result.bytes, bytes.length);
    }
    assert.deepEqual(await readFile(executable), bytes);
    assert.equal((await preloadBrowserExecutable(executable, { signal: AbortSignal.abort() })).outcome, 'unavailable');
    await truncate(executable, 512 * 1024 * 1024 + 1);
    const oversized = await preloadBrowserExecutable(executable);
    assert.equal(oversized.outcome, 'skipped');
    assert.equal(oversized.bytes, 0, 'oversized candidates are never streamed');
    await writeFile(executable, 'not an ELF executable');
    assert.equal((await preloadBrowserExecutable(executable)).outcome, 'skipped');
    assert.equal((await preloadBrowserExecutable(directory)).outcome, 'skipped');
    assert.equal((await preloadBrowserExecutable(path.join(directory, 'missing'))).outcome, 'unavailable');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
