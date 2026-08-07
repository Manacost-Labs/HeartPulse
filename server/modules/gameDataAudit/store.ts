import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { AuditReport, AuditState } from './types.js';

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o640 });
  await rename(temporary, path);
}

export async function loadAuditState(stateDir: string): Promise<AuditState | null> {
  try {
    const value = JSON.parse(await readFile(join(stateDir, 'state.json'), 'utf8')) as AuditState;
    return value.schemaVersion === 1 ? value : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveAuditResult(stateDir: string, report: AuditReport, state: AuditState): Promise<string> {
  const reportsDir = join(stateDir, 'reports');
  const filename = `${report.checkedAt.replace(/[:.]/g, '-')}-${report.auditId.slice(-12)}.json`;
  const reportPath = join(reportsDir, filename);
  await writeJsonAtomic(reportPath, report);
  await writeJsonAtomic(join(stateDir, 'latest.json'), report);
  await writeJsonAtomic(join(stateDir, 'state.json'), state);
  await pruneReports(reportsDir, 90);
  return reportPath;
}

export async function pruneAuditReviews(stateDir: string, keep = 90): Promise<void> {
  await pruneJsonFiles(join(stateDir, 'reviews'), keep);
}

async function pruneReports(reportsDir: string, keep: number): Promise<void> {
  await pruneJsonFiles(reportsDir, keep);
}

async function pruneJsonFiles(directory: string, keep: number): Promise<void> {
  const entries = (await readdir(directory).catch(() => [])).filter(name => name.endsWith('.json')).sort().reverse();
  await Promise.all(entries.slice(keep).map(name => rm(join(directory, name), { force: true })));
}

export async function withAuditLock<T>(stateDir: string, task: () => Promise<T>): Promise<T> {
  await mkdir(stateDir, { recursive: true });
  const lockPath = join(stateDir, '.lock');
  let handle;
  try {
    handle = await open(lockPath, 'wx', 0o640);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const lockPid = Number((await readFile(lockPath, 'utf8').catch(() => '')).trim());
    let active = Number.isSafeInteger(lockPid) && lockPid > 0;
    if (active) {
      try {
        process.kill(lockPid, 0);
      } catch (processError) {
        active = (processError as NodeJS.ErrnoException).code !== 'ESRCH';
      }
    }
    if (active) throw new Error('Game-data audit is already running');
    await rm(lockPath, { force: true });
    try {
      handle = await open(lockPath, 'wx', 0o640);
    } catch (retryError) {
      if ((retryError as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Game-data audit is already running');
      throw retryError;
    }
  }
  try {
    await handle.writeFile(`${process.pid}\n`);
  } catch (error) {
    await handle.close();
    await rm(lockPath, { force: true });
    throw error;
  }
  try {
    return await task();
  } finally {
    await handle.close();
    await rm(lockPath, { force: true });
  }
}
