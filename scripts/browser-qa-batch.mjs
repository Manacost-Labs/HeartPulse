#!/usr/bin/env node
import { runProcess } from './lib/process-task.mjs';
import { qaBatch } from './qa/groups.mjs';
import { preloadBrowserExecutable } from './lib/browser-preload.mjs';

const groups = qaBatch(process.argv[2]);
if (process.platform === 'linux' && process.env.GITHUB_ACTIONS === 'true' && process.env.HP_BROWSER_PRELOAD === '1') {
  console.log(`[browser-preload] ${JSON.stringify(await preloadBrowserExecutable(process.env.CHROMIUM_PATH))}`);
}
const outcomes = await Promise.allSettled(groups.map(async group => {
  const started = performance.now();
  try {
    await runProcess(process.execPath,
      ['scripts/browser-qa-next.mjs'], {
        label: `browser QA ${group}`, repositoryRoot: process.cwd(),
        environment: { ...process.env, QA_GROUP: group, QA_PART: 'all' },
      });
  } finally {
    console.log(`[browser-qa] group=${group} seconds=${((performance.now() - started) / 1000).toFixed(3)}`);
  }
}));
for (const outcome of outcomes) {
  if (outcome.status === 'rejected') {
    console.error(outcome.reason.message);
    process.exitCode = 1;
  }
}
