#!/usr/bin/env node
import { closeSync, fstatSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateTestDurations } from './test-suite-runner.mjs';

function validateReport(report) {
  if (report?.version !== 1) throw new Error('timing report version must be 1');
  const run = report.run;
  if (!/^\d+$/.test(run?.id) || !/^[1-9]\d*$/.test(run?.attempt)
    || !/^[a-f0-9]{40}$/.test(run?.sha)) throw new Error('timing report requires a valid CI run identity');
  if (!Array.isArray(report.results)) throw new Error('timing report results must be an array');
  if (![null, 'exclude', 'only'].includes(report.quarantine)) throw new Error('invalid timing quarantine mode');
  for (const result of report.results) {
    if (!['PASS', 'FLAKY', 'FAIL', 'NOT RUN'].includes(result.status)) throw new Error('invalid timing status');
    const milliseconds = result.milliseconds;
    if (result.status === 'NOT RUN' ? milliseconds !== null
      : typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new Error(`invalid duration for ${result.testFile}`);
    }
    validateTestDurations({ version: 1, defaultSeconds: 1, seconds: { [result.testFile]: 1 } });
  }
}

function fullRun(report, allowFullPullRequests = false) {
  return report.quarantine !== 'only' && (report.run.event === 'merge_group'
    || (report.run.event === 'push' && report.run.ref === 'refs/heads/main')
    || (allowFullPullRequests && report.run.event === 'pull_request'));
}

function latestReports(reports, allowFullPullRequests) {
  const attempts = new Map();
  for (const report of reports) {
    validateReport(report);
    if (fullRun(report, allowFullPullRequests)) attempts.set(report.run.id, Math.max(attempts.get(report.run.id) ?? 0, Number(report.run.attempt)));
  }
  return reports.filter(report => fullRun(report, allowFullPullRequests) && Number(report.run.attempt) === attempts.get(report.run.id));
}

function verifyPullRequestCoverage(reports, registered, quarantined) {
  const runs = Map.groupBy(reports.filter(report => report.run.event === 'pull_request'), report => report.run.id);
  for (const [id, shards] of runs) {
    const results = shards.flatMap(report => report.results);
    const files = new Set(results.map(result => result.testFile));
    if (results.some(result => !['PASS', 'FLAKY'].includes(result.status))
      || [...registered].some(file => !quarantined.has(file) && !files.has(file))) {
      throw new Error(`PR run ${id} must cover every unquarantined registered test with complete results`);
    }
  }
}

function collectSamples(reports, registered, { allowFullPullRequests, quarantined }) {
  const samples = new Map();
  const seen = new Set();
  const runs = new Map();
  const latest = latestReports(reports, allowFullPullRequests);
  if (allowFullPullRequests) verifyPullRequestCoverage(latest, registered, quarantined);
  for (const report of latest) {
    const key = `${report.run.id}/${report.run.attempt}`;
    if (runs.has(key) && runs.get(key) !== report.run.sha) throw new Error(`conflicting SHA for run ${key}`);
    runs.set(key, report.run.sha);
    const complete = report.results.every(result => ['PASS', 'FLAKY'].includes(result.status));
    for (const result of report.results) {
      const identity = `${key}:${result.testFile}`;
      if (seen.has(identity)) throw new Error(`duplicate timing observation: ${identity}`);
      seen.add(identity);
      if (!complete || result.status !== 'PASS' || !registered.has(result.testFile)) continue;
      const values = samples.get(result.testFile) ?? [];
      values.push(result.milliseconds / 1000);
      samples.set(result.testFile, values);
    }
  }
  return { samples, runs };
}

function median(values) {
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Distinct latest CI attempts get one vote per file; failed/retried samples never calibrate weights. */
export function calibrateTestDurations(previous, reports, registry, { allowFullPullRequests = false } = {}) {
  validateTestDurations(previous);
  const registered = new Set(registry.suites.flatMap(suite => suite.files));
  const { samples, runs } = collectSamples(reports, registered, {
    allowFullPullRequests, quarantined: new Set((registry.quarantine ?? []).map(entry => entry.file)),
  });
  const seconds = Object.fromEntries(Object.entries(previous.seconds).filter(([file]) => registered.has(file)));
  let updated = 0;
  for (const [file, values] of [...samples].sort(([left], [right]) => left.localeCompare(right, 'en'))) {
    if (values.length < 2) continue;
    seconds[file] = Math.max(0.001, Math.round(median(values) * 1000) / 1000);
    updated += 1;
  }
  if (!updated) throw new Error('no test has PASS timings from at least two distinct full runs');
  const identities = [...runs.keys()].sort();
  return validateTestDurations({
    version: 1,
    source: `Median PASS seconds from full CI runs ${identities.join(', ')}; at least two distinct runs per updated file. Other existing weights retained.${allowFullPullRequests ? ' PR opt-in requires complete registry coverage.' : ''}`,
    defaultSeconds: previous.defaultSeconds,
    seconds,
  });
}

function readReports(input) {
  const descriptor = openSync(input, 'r');
  try {
    if (fstatSync(descriptor).isDirectory()) {
      return readdirSync(input, { withFileTypes: true }).flatMap(entry => {
        const child = path.join(input, entry.name);
        return entry.isDirectory() || (entry.isFile() && entry.name.endsWith('.json')) ? readReports(child) : [];
      });
    }
    const parsed = JSON.parse(readFileSync(descriptor, 'utf8'));
    return Array.isArray(parsed) ? parsed : [parsed];
  } finally {
    closeSync(descriptor);
  }
}

function main(args) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const options = { '--output': path.join(root, 'tests/test-durations.json'), '--registry': path.join(root, 'tests/test-suites.json') };
  const seen = new Set();
  let allowFullPullRequests = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--allow-full-pr' && !seen.has(flag)) {
      seen.add(flag);
      allowFullPullRequests = true;
      continue;
    }
    if (!['--reports', '--output', '--registry'].includes(flag) || seen.has(flag)
      || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('usage: node scripts/update-test-durations.mjs --reports <file-or-directory> [--output <manifest>] [--registry <registry>] [--allow-full-pr]');
    seen.add(flag);
    options[flag] = args[++index];
  }
  if (!options['--reports']) throw new Error('--reports is required');
  const previous = JSON.parse(readFileSync(options['--output'], 'utf8'));
  const registry = JSON.parse(readFileSync(options['--registry'], 'utf8'));
  const updated = calibrateTestDurations(previous, readReports(options['--reports']), registry, { allowFullPullRequests });
  writeFileSync(options['--output'], `${JSON.stringify(updated, null, 2)}\n`);
  console.log(updated.source);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`test durations: ${error.message}`);
    process.exitCode = 1;
  }
}
