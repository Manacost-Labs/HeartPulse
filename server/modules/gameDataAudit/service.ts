import { join } from 'node:path';

import { runCodexReview } from './codex.js';
import { buildAuditReport, isAuditDue, stateFromReport } from './model.js';
import { collectSource } from './repository.js';
import { loadAuditState, pruneAuditReviews, saveAuditResult, withAuditLock } from './store.js';
import type { AuditManifest, AuditReport } from './types.js';

export async function runGameDataAudit(options: {
  manifest: AuditManifest;
  stateDir: string;
  cwd: string;
  scheduled?: boolean;
  force?: boolean;
  invokeCodex?: boolean;
  now?: Date;
}): Promise<{
  skipped: boolean;
  report: AuditReport | null;
  reportPath?: string;
  reviewPath?: string;
  reviewOk?: boolean;
}> {
  const now = options.now ?? new Date();
  return withAuditLock(options.stateDir, async () => {
    const previous = await loadAuditState(options.stateDir);
    if (options.scheduled && !options.force && !isAuditDue(previous, now, options.manifest)) {
      return { skipped: true, report: null };
    }

    const observations = await Promise.all(options.manifest.sources.map(source => collectSource(source, { now })));
    const report = buildAuditReport({
      now,
      previous,
      observations,
      fastModeHours: options.manifest.fastModeHours,
    });
    const reportPath = await saveAuditResult(options.stateDir, report, stateFromReport(report, previous));
    let reviewPath: string | undefined;
    let reviewOk: boolean | undefined;
    if (options.invokeCodex && report.shouldInvokeCodex && process.env.GAME_DATA_AUDIT_CODEX_CHILD !== '1') {
      reviewPath = join(options.stateDir, 'reviews', `${report.auditId}.json`);
      const review = await runCodexReview({ report, cwd: options.cwd, outputPath: reviewPath });
      reviewOk = review.ok;
      await pruneAuditReviews(options.stateDir);
    }
    return { skipped: false, report, reportPath, reviewPath, reviewOk };
  });
}
