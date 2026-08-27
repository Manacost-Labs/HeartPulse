export type LifecycleResource = {
  name: string;
  stop: () => void | Promise<void>;
};

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

type SignalEmitter = {
  once: (signal: ShutdownSignal, listener: () => void) => unknown;
  removeListener: (signal: ShutdownSignal, listener: () => void) => unknown;
};

type HttpServerLifecycle = {
  close: (callback: (error?: Error) => void) => unknown;
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
};

type TimeoutHandle = {
  unref?: () => void;
};

type ProcessLifecycleOptions = {
  server: HttpServerLifecycle;
  quiesce?: LifecycleResource[];
  dispose?: LifecycleResource[];
  signalEmitter?: SignalEmitter;
  timeoutMs?: number;
  setTimeoutImpl?: (callback: () => void, milliseconds: number) => TimeoutHandle;
  clearTimeoutImpl?: (handle: TimeoutHandle) => void;
  exit?: (code: number) => void;
  log?: (level: 'error' | 'info', message: string, error?: unknown) => void;
};

export type ProcessLifecycle = {
  shutdown: (signal: ShutdownSignal) => Promise<void>;
  completion: () => Promise<void>;
  removeSignalHandlers: () => void;
};

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;
const SHUTDOWN_SIGNALS: ShutdownSignal[] = ['SIGINT', 'SIGTERM'];

function defaultLog(level: 'error' | 'info', message: string, error?: unknown): void {
  if (level === 'error') console.error(message, error ?? '');
  else console.log(message);
}

export function installProcessLifecycle(options: ProcessLifecycleOptions): ProcessLifecycle {
  const signalEmitter = options.signalEmitter ?? process;
  const configuredTimeoutMs = options.timeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(configuredTimeoutMs)
    ? Math.max(100, configuredTimeoutMs)
    : DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const scheduleTimeout = options.setTimeoutImpl
    ?? ((callback: () => void, milliseconds: number) => setTimeout(callback, milliseconds));
  const clearScheduledTimeout = options.clearTimeoutImpl
    ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const exit = options.exit ?? (code => process.exit(code));
  const log = options.log ?? defaultLog;
  let shutdownPromise: Promise<void> | null = null;
  let exitRequested = false;

  const requestExit = (code: number) => {
    if (exitRequested) return;
    exitRequested = true;
    exit(code);
  };

  const stopResources = async (resources: LifecycleResource[]): Promise<boolean> => {
    let failed = false;
    for (const resource of [...resources].reverse()) {
      try {
        await resource.stop();
      } catch (error) {
        failed = true;
        log('error', `[lifecycle] failed to stop ${resource.name}`, error);
      }
    }
    return failed;
  };

  const removeSignalHandlers = () => {
    for (const signal of SHUTDOWN_SIGNALS) {
      signalEmitter.removeListener(signal, signalHandlers[signal]);
    }
  };

  const shutdown = (signal: ShutdownSignal): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      log('info', `[lifecycle] ${signal} received; draining server`);
      let failed = false;
      const deadline = scheduleTimeout(() => {
        log('error', `[lifecycle] shutdown exceeded ${timeoutMs}ms`);
        try {
          options.server.closeAllConnections?.();
        } catch (error) {
          log('error', '[lifecycle] failed to force-close HTTP connections', error);
        }
        requestExit(1);
      }, timeoutMs);
      deadline.unref?.();

      const serverClosed = new Promise<void>(resolve => {
        try {
          options.server.close(error => {
            if (error) {
              failed = true;
              log('error', '[lifecycle] HTTP server close failed', error);
            }
            resolve();
          });
          options.server.closeIdleConnections?.();
        } catch (error) {
          failed = true;
          log('error', '[lifecycle] HTTP server close failed', error);
          resolve();
        }
      });

      failed = (await stopResources(options.quiesce ?? [])) || failed;
      await serverClosed;
      failed = (await stopResources(options.dispose ?? [])) || failed;
      clearScheduledTimeout(deadline);
      removeSignalHandlers();
      log(failed ? 'error' : 'info', failed
        ? '[lifecycle] shutdown completed with errors'
        : '[lifecycle] shutdown complete');
      requestExit(failed ? 1 : 0);
    })();
    return shutdownPromise;
  };

  const signalHandlers = Object.fromEntries(SHUTDOWN_SIGNALS.map(signal => [
    signal,
    () => { void shutdown(signal); },
  ])) as Record<ShutdownSignal, () => void>;
  for (const signal of SHUTDOWN_SIGNALS) signalEmitter.once(signal, signalHandlers[signal]);

  return {
    shutdown,
    completion: () => shutdownPromise ?? Promise.resolve(),
    removeSignalHandlers,
  };
}
