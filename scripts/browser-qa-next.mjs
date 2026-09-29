#!/usr/bin/env node
/**
 * Runs the browser QA suite (scripts/e2e-qa.mjs) against the production
 * renderer: the local gateway routes pages to Next.js, which renders them from
 * the QA backend fixtures (scripts/qa/), while browser `/api` calls keep being
 * intercepted with the same fixtures. Requires `npm run build` and
 * `npm run build:next`.
 */
import { spawn } from 'node:child_process';
import { startQaNextRuntime } from './qa/nextRuntime.mjs';

const runtime = await startQaNextRuntime();
try {
  console.log(`[browser-qa] Next runtime ready: ${runtime.origin}`);
  const qa = spawn(process.execPath, ['scripts/e2e-qa.mjs', `--url=${runtime.origin}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      QA_RENDERER: 'next',
      QA_RESPONSIVE_SCOPE: process.env.QA_RESPONSIVE_SCOPE || 'representative',
    },
    stdio: 'inherit',
  });
  const status = await new Promise(resolveStatus => qa.once('exit', code => resolveStatus(code ?? 1)));
  if (status !== 0) process.exitCode = status;
} finally {
  await runtime.close();
}
