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
  let stopping = false;
  let activeRefresh: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;

  const refresh = (): Promise<void> => {
    if (stopping) return Promise.resolve();
    if (activeRefresh) return activeRefresh;

    let tracked!: Promise<void>;
    tracked = Promise.resolve()
      .then(async () => {
        log('info', '[Subscription] Starting scheduled subscription refresh...');
        try {
          await options.refresh();
          log('info', '[Subscription] Scheduled subscription refresh complete.');
        } catch (error) {
          log('error', '[Subscription] Scheduled subscription refresh failed:', error);
        }
      })
      .finally(() => {
        if (activeRefresh === tracked) activeRefresh = null;
      });
    activeRefresh = tracked;
    return tracked;
  };

  const task = schedule(options.scheduleExpression ?? DEFAULT_SCHEDULE, refresh);

  const stop = (): Promise<void> => {
    if (stopPromise) return stopPromise;
    stopping = true;
    const refreshToDrain = activeRefresh;
    stopPromise = (async () => {
      let stopFailed = false;
      let stopError: unknown;
      try {
        await task.stop();
      } catch (error) {
        stopFailed = true;
        stopError = error;
      }
      await refreshToDrain;
      if (stopFailed) throw stopError;
    })();
    return stopPromise;
  };

  return {
    stop,
  };
}
