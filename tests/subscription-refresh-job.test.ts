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
