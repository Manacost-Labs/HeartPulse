import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { installProcessLifecycle } from '../server/app/lifecycle/processLifecycle.js';

test('quiesces jobs, drains HTTP and disposes resources exactly once', async () => {
  const events: string[] = [];
  const exits: number[] = [];
  const signals = new EventEmitter();
  const lifecycle = installProcessLifecycle({
    server: {
      close(callback) {
        events.push('server:close');
        queueMicrotask(() => {
          events.push('server:closed');
          callback();
        });
        return this;
      },
      closeIdleConnections() {
        events.push('server:idle');
      },
      closeAllConnections() {
        events.push('server:all');
      },
    },
    signalEmitter: signals,
    quiesce: [
      { name: 'first-job', stop: () => { events.push('quiesce:first'); } },
      { name: 'second-job', stop: async () => { events.push('quiesce:second'); } },
    ],
    dispose: [
      { name: 'database', stop: () => { events.push('dispose:database'); } },
    ],
    exit: code => { exits.push(code); },
    timeoutMs: 1_000,
  });

  signals.emit('SIGTERM');
  await lifecycle.completion();
  signals.emit('SIGINT');
  await lifecycle.shutdown('SIGINT');

  assert.equal(events.filter(event => event === 'server:close').length, 1);
  assert.equal(events.filter(event => event === 'quiesce:first').length, 1);
  assert.equal(events.filter(event => event === 'quiesce:second').length, 1);
  assert.ok(events.indexOf('quiesce:second') < events.indexOf('quiesce:first'));
  assert.ok(events.indexOf('server:closed') < events.indexOf('dispose:database'));
  assert.deepEqual(exits, [0]);
});

test('forces remaining connections closed when the drain deadline expires', async () => {
  let timeoutCallback: (() => void) | null = null;
  const events: string[] = [];
  const exits: number[] = [];
  const lifecycle = installProcessLifecycle({
    server: {
      close() {
        events.push('server:close');
        return this;
      },
      closeAllConnections() {
        events.push('server:all');
      },
    },
    signalEmitter: new EventEmitter(),
    exit: code => { exits.push(code); },
    log: () => {},
    timeoutMs: 25,
    setTimeoutImpl: callback => {
      timeoutCallback = callback;
      return { unref() {} };
    },
    clearTimeoutImpl: () => {},
  });

  void lifecycle.shutdown('SIGTERM');
  await Promise.resolve();
  assert.ok(timeoutCallback);
  (timeoutCallback as () => void)();
  await Promise.resolve();

  assert.deepEqual(events, ['server:close', 'server:all']);
  assert.deepEqual(exits, [1]);
});

test('continues shutdown after a resource error and exits unsuccessfully', async () => {
  const events: string[] = [];
  const exits: number[] = [];
  const lifecycle = installProcessLifecycle({
    server: {
      close(callback) {
        callback();
        return this;
      },
    },
    signalEmitter: new EventEmitter(),
    quiesce: [
      { name: 'healthy-job', stop: () => { events.push('healthy'); } },
      { name: 'broken-job', stop: () => { throw new Error('stop failed'); } },
    ],
    exit: code => { exits.push(code); },
    log: () => {},
  });

  await lifecycle.shutdown('SIGTERM');

  assert.deepEqual(events, ['healthy']);
  assert.deepEqual(exits, [1]);
});

test('active resource drain remains bounded by the lifecycle deadline', async () => {
  let timeoutCallback: (() => void) | null = null;
  let finishDrain: (() => void) | null = null;
  const exits: number[] = [];
  const drain = new Promise<void>(resolve => { finishDrain = resolve; });
  const lifecycle = installProcessLifecycle({
    server: {
      close(callback) {
        callback();
        return this;
      },
      closeAllConnections() {},
    },
    signalEmitter: new EventEmitter(),
    quiesce: [{ name: 'active-job', stop: () => drain }],
    exit: code => { exits.push(code); },
    log: () => {},
    timeoutMs: 25,
    setTimeoutImpl: callback => {
      timeoutCallback = callback;
      return { unref() {} };
    },
    clearTimeoutImpl: () => {},
  });

  const shutdown = lifecycle.shutdown('SIGTERM');
  await Promise.resolve();
  assert.deepEqual(exits, []);
  assert.ok(timeoutCallback);
  (timeoutCallback as () => void)();
  assert.deepEqual(exits, [1]);

  assert.ok(finishDrain);
  (finishDrain as () => void)();
  await shutdown;
  assert.deepEqual(exits, [1], 'deadline failure must remain authoritative after drain completes');
});
