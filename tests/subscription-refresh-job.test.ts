import assert from 'node:assert/strict';
import test from 'node:test';

import { startSubscriptionRefreshJob } from '../server/modules/subscription/public.js';

test('subscription refresh job preserves schedule, logging and idempotent stop', async () => {
  const logs: Array<{ level: string; message: string }> = [];
  let scheduledHandler: (() => Promise<void>) | null = null;
  let stopped = 0;
  let refreshes = 0;

  const job = startSubscriptionRefreshJob({
    refresh: async () => { refreshes += 1; },
    schedule: (expression, handler) => {
      assert.equal(expression, '*/30 * * * *');
      scheduledHandler = handler;
      return { stop: () => { stopped += 1; } };
    },
    log: (level, message) => { logs.push({ level, message }); },
  });

  assert.ok(scheduledHandler);
  await (scheduledHandler as () => Promise<void>)();
  await job.stop();
  await job.stop();

  assert.equal(refreshes, 1);
  assert.equal(stopped, 1);
  assert.deepEqual(logs, [
    { level: 'info', message: '[Subscription] Starting scheduled subscription refresh...' },
    { level: 'info', message: '[Subscription] Scheduled subscription refresh complete.' },
  ]);
});

test('subscription refresh failure remains handled inside the scheduled job', async () => {
  const logs: Array<{ level: string; message: string; error?: unknown }> = [];
  let scheduledHandler: (() => Promise<void>) | null = null;
  const failure = new Error('provider unavailable');

  startSubscriptionRefreshJob({
    refresh: async () => { throw failure; },
    schedule: (_expression, handler) => {
      scheduledHandler = handler;
      return { stop: () => {} };
    },
    log: (level, message, error) => { logs.push({ level, message, error }); },
  });

  assert.ok(scheduledHandler);
  await assert.doesNotReject((scheduledHandler as () => Promise<void>)());
  assert.deepEqual(logs, [
    { level: 'info', message: '[Subscription] Starting scheduled subscription refresh...', error: undefined },
    { level: 'error', message: '[Subscription] Scheduled subscription refresh failed:', error: failure },
  ]);
});

test('stop blocks new refreshes and returns one promise after draining the active refresh', async () => {
  let scheduledHandler: (() => Promise<void>) | null = null;
  let finishRefresh: (() => void) | null = null;
  let refreshes = 0;
  let stopped = 0;
  const refreshFinished = new Promise<void>(resolve => { finishRefresh = resolve; });
  const job = startSubscriptionRefreshJob({
    refresh: async () => {
      refreshes += 1;
      await refreshFinished;
    },
    schedule: (_expression, handler) => {
      scheduledHandler = handler;
      return { stop: () => { stopped += 1; } };
    },
    log: () => {},
  });

  assert.ok(scheduledHandler);
  const activeRefresh = (scheduledHandler as () => Promise<void>)();
  await Promise.resolve();
  assert.equal(refreshes, 1);

  const firstStop = job.stop();
  const secondStop = job.stop();
  assert.equal(firstStop, secondStop, 'every stop call must return the same drain promise');
  let stopSettled = false;
  void firstStop.then(() => { stopSettled = true; });
  await Promise.resolve();
  assert.equal(stopSettled, false, 'stop must remain pending while refresh is active');

  await (scheduledHandler as () => Promise<void>)();
  assert.equal(refreshes, 1, 'the stopping gate must reject a new scheduled refresh');

  assert.ok(finishRefresh);
  (finishRefresh as () => void)();
  await activeRefresh;
  await firstStop;
  assert.equal(stopped, 1);
});

test('concurrent scheduled handlers share one handled refresh', async () => {
  let scheduledHandler: (() => Promise<void>) | null = null;
  let finishRefresh: (() => void) | null = null;
  let refreshes = 0;
  const refreshFinished = new Promise<void>(resolve => { finishRefresh = resolve; });
  const job = startSubscriptionRefreshJob({
    refresh: async () => {
      refreshes += 1;
      await refreshFinished;
    },
    schedule: (_expression, handler) => {
      scheduledHandler = handler;
      return { stop: () => {} };
    },
    log: () => {},
  });

  assert.ok(scheduledHandler);
  const first = (scheduledHandler as () => Promise<void>)();
  const second = (scheduledHandler as () => Promise<void>)();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(refreshes, 1);
  assert.ok(finishRefresh);
  (finishRefresh as () => void)();
  await Promise.all([first, second]);
  await job.stop();
});

test('cron stop errors reject the shared stop promise only after refresh drain', async () => {
  let scheduledHandler: (() => Promise<void>) | null = null;
  let rejectRefresh: ((error: Error) => void) | null = null;
  const refreshFailure = new Error('refresh failed');
  const stopFailure = new Error('cron stop failed');
  const refreshFinished = new Promise<void>((_resolve, reject) => { rejectRefresh = reject; });
  const job = startSubscriptionRefreshJob({
    refresh: async () => refreshFinished,
    schedule: (_expression, handler) => {
      scheduledHandler = handler;
      return { stop: () => { throw stopFailure; } };
    },
    log: () => {},
  });

  assert.ok(scheduledHandler);
  const activeRefresh = (scheduledHandler as () => Promise<void>)();
  await Promise.resolve();
  const stop = job.stop();
  let stopSettled = false;
  void stop.catch(() => { stopSettled = true; });
  await Promise.resolve();
  assert.equal(stopSettled, false, 'cron stop failure must not bypass active refresh drain');
  assert.ok(rejectRefresh);
  (rejectRefresh as (error: Error) => void)(refreshFailure);
  await assert.doesNotReject(activeRefresh, 'refresh rejection must stay handled by the job');
  await assert.rejects(stop, error => error === stopFailure);
  assert.equal(job.stop(), stop);
});
