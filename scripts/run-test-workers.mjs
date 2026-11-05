#!/usr/bin/env node
import path from 'node:path';
import { availableParallelism, freemem, loadavg, totalmem } from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseRunnerArguments } from './test-suite-runner.mjs';
import { runProcess } from './lib/process-task.mjs';

/** Stripe global shards across jobs so the longest shards do not compete on one runner. */
export function planTestWorkers(args) {
  const forwarded = [];
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--warmup-browser') {
      if (options.has(flag)) throw new Error(`duplicate ${flag}`);
      options.set(flag, true);
    } else if (['--workers', '--report-dir'].includes(flag)) {
      if (options.has(flag) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`invalid ${flag}`);
      options.set(flag, args[++index]);
    } else forwarded.push(flag);
  }
  const workers = Number(options.get('--workers'));
  const directory = options.get('--report-dir');
  if (!Number.isInteger(workers) || workers < 1 || workers > 4 || !directory) throw new Error('--workers must be 1–4 and --report-dir is required');
  const parsed = parseRunnerArguments(forwarded);
  if (options.has('--warmup-browser') && (parsed.suiteIds.length !== 1 || parsed.suiteIds[0] !== 'browser')) {
    throw new Error('--warmup-browser requires --suite browser');
  }
  if (!parsed.shard || parsed.reportPath) throw new Error('--shard is required; use --report-dir instead of --report');
  const offset = forwarded.indexOf('--shard');
  return Array.from({ length: workers }, (_, worker) => {
    const next = [...forwarded];
    next[offset + 1] = `${parsed.shard.index + worker * parsed.shard.total}/${parsed.shard.total * workers}`;
    return [...next, '--report', path.join(directory, `worker-${worker + 1}.json`)];
  });
}

async function warmBrowser(environment) {
  if (!environment.CHROMIUM_PATH) throw new Error('--warmup-browser requires CHROMIUM_PATH');
  const { launchBrowser } = await import('./lib/browser-launch.mjs');
  const browser = await launchBrowser({
    executablePath: environment.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'],
  });
  await browser.close();
}

export async function runTestWorkers(args, {
  repositoryRoot = process.cwd(), environment = process.env, execute = runProcess,
  warmBrowser: prepareBrowser = warmBrowser,
} = {}) {
  const workers = planTestWorkers(args);
  const reportResources = () => {
    const available = typeof process.availableMemory === 'function' ? process.availableMemory() : freemem();
    console.log(`[test-workers] workers=${workers.length} cpus=${availableParallelism()} memoryTotalMiB=${Math.round(totalmem() / 1048576)} memoryAvailableMiB=${Math.round(available / 1048576)} load1=${loadavg()[0].toFixed(2)}`);
  };
  let resourceTimer;
  if (environment.GITHUB_ACTIONS === 'true') {
    reportResources();
    resourceTimer = setInterval(reportResources, 20_000);
    resourceTimer.unref();
  }
  try {
    // Keep cold-start work outside individual cases, but inside the measured CI job.
    if (args.includes('--warmup-browser')) await prepareBrowser(environment);
    const outcomes = await Promise.allSettled(workers.map((flags, index) => execute(process.execPath,
      ['scripts/test-suite-runner.mjs', ...flags], {
        label: `test worker ${index + 1}`, repositoryRoot,
        environment: { ...environment, HP_TEST_COMPILED_BACKEND: '1', PRODUCTION_SCRAPER_BUILD_READY: '1' },
      })));
    const failures = outcomes.filter(outcome => outcome.status === 'rejected');
    if (failures.length) throw failures.find(outcome => outcome.reason.interrupted)?.reason ?? failures[0].reason;
  } finally {
    if (resourceTimer) clearInterval(resourceTimer);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runTestWorkers(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = error.exitCode || 1;
  });
}
