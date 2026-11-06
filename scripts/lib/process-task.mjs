import { spawn } from 'node:child_process';
const FORCE_KILL_DELAY_MS = 1_000;
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM'];

export function terminateChild(child, signal) {
  if (process.platform !== 'win32' && Number.isInteger(child.pid)) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  }
  child.kill?.(signal);
}

export function runProcess(command, args, {
  label: testFile, repositoryRoot, environment,
  spawnImpl = spawn, signalEmitter = process, killImpl = terminateChild,
}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      cwd: repositoryRoot,
      detached: process.platform !== 'win32',
      env: environment,
      shell: false,
      stdio: 'inherit',
    });
    let settled = false;
    let forwardedSignal = null;
    let forceKillTimer = null;
    let forceKillSent = false;
    const cleanup = () => {
      for (const signal of FORWARDED_SIGNALS) signalEmitter.removeListener(signal, signalHandlers[signal]);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    };
    const interruptError = signal => {
      const error = new Error(`${testFile} interrupted by ${signal}`);
      error.signal = signal;
      error.testFile = testFile;
      error.interrupted = true;
      return error;
    };
    const forceKill = () => {
      if (forceKillSent) return;
      forceKillSent = true;
      try {
        killImpl(child, 'SIGKILL');
      } catch {
        // The original interruption remains the result even if the group exited first.
      }
    };
    const forwardSignal = signal => {
      if (settled) return;
      if (forwardedSignal) {
        forceKill();
        return;
      }
      forwardedSignal = signal;
      try {
        killImpl(child, signal);
        forceKillTimer = setTimeout(forceKill, FORCE_KILL_DELAY_MS);
        forceKillTimer.unref?.();
      } catch (error) {
        settled = true;
        cleanup();
        const interrupted = interruptError(signal);
        interrupted.cause = error;
        reject(interrupted);
      }
    };
    const signalHandlers = Object.fromEntries(
      FORWARDED_SIGNALS.map(signal => [signal, () => forwardSignal(signal)]),
    );
    for (const signal of FORWARDED_SIGNALS) signalEmitter.on(signal, signalHandlers[signal]);

    const rejectInterrupted = () => {
      if (!forwardedSignal) return false;
      forceKill();
      cleanup();
      reject(interruptError(forwardedSignal));
      return true;
    };

    child.once('error', error => {
      if (settled) return;
      settled = true;
      if (rejectInterrupted()) return;
      cleanup();
      error.testFile = testFile;
      reject(error);
    });
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      if (rejectInterrupted()) return;
      cleanup();
      if (signal) {
        const error = new Error(`${testFile} terminated by ${signal}`);
        error.signal = signal;
        error.testFile = testFile;
        reject(error);
        return;
      }
      if (exitCode !== 0) {
        const error = new Error(`${testFile} exited with code ${exitCode}`);
        error.exitCode = exitCode;
        error.testFile = testFile;
        reject(error);
        return;
      }
      resolve();
    });
  });
}
