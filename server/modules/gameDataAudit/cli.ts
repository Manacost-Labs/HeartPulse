import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadAuditManifest } from './repository.js';
import { runGameDataAudit } from './service.js';

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const cwd = resolve(process.env.APP_ROOT_DIR || process.cwd());
const manifestPath = resolve(option('manifest', process.env.GAME_DATA_AUDIT_MANIFEST || `${cwd}/config/game-data-audit.json`));
const stateDir = resolve(option('state-dir', process.env.GAME_DATA_AUDIT_STATE_DIR || `${cwd}/.runtime/game-data-audit`));
const scheduled = process.argv.includes('--scheduled');
const force = process.argv.includes('--force');
const codexMode = (process.env.GAME_DATA_AUDIT_CODEX_ENABLED || '0').trim().toLowerCase();
const codexHome = process.env.CODEX_HOME?.trim() || '';
const autoCodexReady = codexMode === 'auto' && Boolean(codexHome) && existsSync(resolve(codexHome, 'auth.json'));
const invokeCodex = process.argv.includes('--invoke-codex') || codexMode === '1' || autoCodexReady;

try {
  const manifest = await loadAuditManifest(manifestPath);
  const result = await runGameDataAudit({ manifest, stateDir, cwd, scheduled, force, invokeCodex });
  if (result.skipped) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'not_due' }));
  } else {
    console.log(JSON.stringify({
      status: result.report?.status,
      auditId: result.report?.auditId,
      reportPath: result.reportPath,
      reviewPath: result.reviewPath,
      reviewOk: result.reviewOk,
      summary: result.report?.summary,
    }));
    if (result.reviewOk === false) process.exitCode = 21;
    else if (result.report?.status === 'incomplete') process.exitCode = 20;
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : 'unknown error' }));
  process.exitCode = 30;
}
