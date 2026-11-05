#!/usr/bin/env node
import { runProcess } from './lib/process-task.mjs';
import { qaBatch } from './qa/groups.mjs';

const groups = qaBatch(process.argv[2]);
const outcomes = await Promise.allSettled(groups.map(group => runProcess(process.execPath,
  ['scripts/browser-qa-next.mjs'], {
    label: `browser QA ${group}`, repositoryRoot: process.cwd(),
    environment: { ...process.env, QA_GROUP: group, QA_PART: 'all' },
  })));
for (const outcome of outcomes) {
  if (outcome.status === 'rejected') {
    console.error(outcome.reason.message);
    process.exitCode = 1;
  }
}
