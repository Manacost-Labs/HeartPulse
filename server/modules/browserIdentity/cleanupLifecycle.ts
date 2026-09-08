import type { DatabaseSync } from 'node:sqlite';
import { cleanupIdentityStorage } from './cleanup.js';

/** Bounded housekeeping only; consumed-token and revoked-grant history must survive. */
export function startIdentityCleanup(database: DatabaseSync) {
  const timer = setInterval(() => {
    try { cleanupIdentityStorage(database); }
    catch { console.warn('[browser-identity] Expiry cleanup failed'); }
  }, 60_000);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
