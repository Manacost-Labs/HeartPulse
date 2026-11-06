import { readFileSync } from 'node:fs';

function readProc(file) {
  try { return readFileSync(file, 'utf8'); } catch { return null; }
}

function childSnapshot(pid) {
  const root = `/proc/${pid}`;
  const status = readProc(`${root}/status`);
  if (Number(status?.match(/^PPid:\s+(\d+)/m)?.[1]) !== process.pid) return null;
  const scheduler = readProc(`${root}/schedstat`)?.trim().split(/\s+/).map(Number);
  const readBytes = readProc(`${root}/io`)?.match(/^read_bytes:\s+(\d+)/m)?.[1];
  const wait = readProc(`${root}/wchan`)?.trim();
  return {
    pid: Number(pid),
    state: status.match(/^State:\s+(\w)/m)?.[1] ?? null,
    mainThreadCpuMs: scheduler ? Math.round(scheduler[0] / 1e6) : null,
    mainThreadRunQueueMs: scheduler ? Math.round(scheduler[1] / 1e6) : null,
    readBytes: readBytes === undefined ? null : Number(readBytes),
    waitChannel: wait && /^[\w.]{1,80}$/.test(wait) ? wait : null,
  };
}

/** Observe only this launcher's direct children while its blank browser warms. */
export function startWarmupDiagnostics({ emit = console.log, intervalMs = 1000 } = {}) {
  if (process.platform !== 'linux') return () => {};
  const started = performance.now();
  const sample = () => {
    const children = readProc(`/proc/${process.pid}/task/${process.pid}/children`);
    const pids = children?.trim().split(/\s+/).filter(pid => /^\d+$/.test(pid)).slice(0, 8) ?? [];
    // Never emit cmdline, environ, file paths, or raw /proc contents.
    emit(`[browser-warmup] ${JSON.stringify({
      elapsedMs: Math.round(performance.now() - started),
      available: children !== null,
      children: pids.map(childSnapshot).filter(Boolean),
    })}`);
  };
  const timer = setInterval(sample, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
