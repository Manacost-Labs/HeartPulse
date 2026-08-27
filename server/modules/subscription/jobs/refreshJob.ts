import cron from 'node-cron';

type ScheduledTask = {
  stop: () => void | Promise<void>;
};

type Schedule = (
  expression: string,
  handler: () => Promise<void>,
) => ScheduledTask;

type SubscriptionRefreshJobOptions = {
  refresh: () => Promise<unknown>;
  scheduleExpression?: string;
  schedule?: Schedule;
  log?: (level: 'error' | 'info', message: string, error?: unknown) => void;
};

export type SubscriptionRefreshJob = {
  stop: () => Promise<void>;
};

const DEFAULT_SCHEDULE = '*/30 * * * *';

function defaultLog(level: 'error' | 'info', message: string, error?: unknown): void {
  if (level === 'error') console.error(message, error);
  else console.log(message);
}

export function startSubscriptionRefreshJob(
  options: SubscriptionRefreshJobOptions,
): SubscriptionRefreshJob {
  const schedule = options.schedule
    ?? ((expression, handler) => cron.schedule(expression, handler));
  const log = options.log ?? defaultLog;
  const task = schedule(options.scheduleExpression ?? DEFAULT_SCHEDULE, async () => {
    log('info', '[Subscription] Starting scheduled subscription refresh...');
    try {
      await options.refresh();
      log('info', '[Subscription] Scheduled subscription refresh complete.');
    } catch (error) {
      log('error', '[Subscription] Scheduled subscription refresh failed:', error);
    }
  });
  let stopped = false;

  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      await task.stop();
    },
  };
}
