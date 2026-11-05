import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Only timing and allowlisted run identity are persisted, never child output or environment. */
export function writeTestTimingReport(reportPath, { results, suites, shard, quarantine, environment }) {
  if (!reportPath) return;
  const report = {
    version: 1,
    run: {
      id: environment.GITHUB_RUN_ID ?? null,
      attempt: environment.GITHUB_RUN_ATTEMPT ?? null,
      sha: environment.GITHUB_SHA ?? null,
      event: environment.GITHUB_EVENT_NAME ?? null,
      ref: environment.GITHUB_REF ?? null,
    },
    suites: [...suites],
    shard: shard ? `${shard.index}/${shard.total}` : null,
    quarantine,
    results: results.map(({ testFile, status, milliseconds }) => ({ testFile, status, milliseconds })),
  };
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
