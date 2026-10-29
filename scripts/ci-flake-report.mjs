#!/usr/bin/env node
/**
 * Report on red runs and flaky tests of the `ci.yml` workflow.
 *
 * It reads the newest completed runs (and every attempt of them) through
 * `gh api`, classifies each red attempt as real / flaky / infra / cancelled
 * and prints the numbers the "stable CI" epic is measured by: red share by
 * event, rerun-green share, top FAIL and FLAKY test files, FLAKY share of green
 * runs and median/p90 duration. Read-only; the token comes from the `gh` CLI
 * environment (`gh auth login` or `GH_TOKEN`), nothing is stored here.
 *
 * Usage: npm run ci:flake-report -- [--runs 150] [--since <ISO>] [--json]
 *   --runs N         newest runs to analyse (default 150)
 *   --since <ISO>    ignore runs created before this moment
 *   --json           print machine-readable JSON instead of markdown
 *   --top N          rows in the top lists (default 10)
 *   --repo OWNER/NAME  repository (default: the one `gh` resolves from the cwd)
 *   --concurrency N  parallel API calls (default 6)
 *   --no-logs        do not download logs of failed jobs (weaker infra detection)
 *   --cache-dir DIR  where finished attempts are cached (default: system temp dir)
 *   --no-cache       neither read nor write the cache
 *
 * A cold run of 150 runs makes about 2000 API requests (the token allows 5000
 * per hour, shared with every other tool); finished attempts never change, so
 * they are cached and a repeated run only fetches what is new.
 */
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const WORKFLOW_FILE = 'ci.yml';
export const DEFAULT_RUNS = 150;
const DEFAULT_TOP = 10;
const DEFAULT_CONCURRENCY = 6;
const PAGE_SIZE = 100;

const RED_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure']);
const EVENT_ORDER = ['pull_request', 'merge_group', 'push'];

// Jobs that never explain a failure: the aggregate gate repeats what other
// jobs reported, and the quarantine job is non-blocking by design.
const AGGREGATE_JOB = /^CI required$/;
const NON_BLOCKING_JOB = /quarantine/i;
// Steps that run the registered test files (the only jobs with FAIL/FLAKY annotations).
const TEST_STEP = /^Run (registered|quarantined)\b/i;
// A failure in these steps is the runner or the network, not the code under test.
const INFRA_STEP = /^(Set up job|Checkout repository|Download |Upload |Restore .*cache|Install identity TLS regression tools|Complete job)/i;
const DEPENDENCY_STEP = /^Install locked dependencies$/i;

const INFRA_PATTERNS = [
  { kind: 'job-timeout', pattern: /exceeded the maximum execution time/i },
  { kind: 'runner-lost', pattern: /runner has received a shutdown signal|lost communication with the server|No space left on device/i },
  {
    kind: 'chrome-launch',
    pattern: /WS endpoint URL to appear|Failed to launch the browser process|Could not find (Chrome|browser)|Browser was not found|while trying to connect to the browser|Protocol error \(Target\.createTarget\)|Cannot start Chrome/i,
  },
  { kind: 'apt-get', pattern: /(?:^|\s)E: (?:Unable|Failed|Could not)|Temporary failure resolving/ },
];
const RECOVERED_LAUNCH = /starting the browser once more/;
const NETWORK_PATTERN = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|npm error network|socket hang up|HTTP 5\d\d|Could not resolve host/i;

export class ReportError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'ReportError';
    this.exitCode = exitCode;
  }
}

/* ------------------------------ network boundary ------------------------------ */

/**
 * The only function that talks to the network: `gh api <endpoint>` returning
 * stdout. Failures become ReportError with a message the reader can act on.
 */
export function createGhApi({ execFileImpl = execFile, env = process.env } = {}) {
  return endpoint => new Promise((resolve, reject) => {
    execFileImpl('gh', ['api', endpoint], { env, maxBuffer: 128 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (!error) {
        resolve(stdout);
        return;
      }
      const detail = String(stderr || error.message || '').trim().split('\n')[0];
      if (error.code === 'ENOENT') {
        reject(new ReportError('GitHub CLI `gh` не найден в PATH. Установите gh (https://cli.github.com) и выполните `gh auth login`.'));
        return;
      }
      const failure = new ReportError(`gh api завершился с ошибкой: ${detail || 'нет вывода'}.`);
      failure.detail = detail;
      failure.rateLimited = /rate limit/i.test(detail);
      failure.transient = !failure.rateLimited && /HTTP (429|5\d\d)|ECONNRESET|ETIMEDOUT|timeout|EOF/i.test(detail);
      failure.authProblem = /gh auth login|GH_TOKEN|GITHUB_TOKEN|HTTP 401|Bad credentials|not logged in/i.test(detail);
      failure.networkProblem = /error connecting|could not resolve|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network is unreachable|dial tcp/i.test(detail);
      failure.notFound = /HTTP 404|HTTP 410/.test(detail);
      if (failure.rateLimited) {
        failure.message = 'Исчерпан лимит запросов GitHub API (5000 в час на токен, он общий для всех инструментов). '
          + 'Узнайте время сброса: `gh api rate_limit --jq .resources.core.reset`. Уже загруженные прогоны сохранены в кэше — повторите запуск после сброса.';
      } else if (failure.authProblem) {
        failure.message = `Нет доступа к GitHub: ${detail}. Выполните \`gh auth login\` или задайте GH_TOKEN.`;
      } else if (failure.networkProblem) {
        failure.message = `Нет связи с GitHub: ${detail}. Проверьте сеть и повторите.`;
      }
      reject(failure);
    });
  });
}

function withRetry(api, { sleep, attempts = 3 }) {
  return async endpoint => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await api(endpoint);
      } catch (error) {
        if (!error.transient || attempt >= attempts) throw error;
        await sleep(1000 * attempt);
      }
    }
  };
}

async function mapPool(items, concurrency, worker) {
  const results = Array.from({ length: items.length });
  let next = 0;
  let failed = false;
  async function lane() {
    while (next < items.length && !failed) {
      const index = next;
      next += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        failed = true; // the other lanes stop taking runs instead of hammering a failing API
        throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}

/**
 * On-disk cache of finished attempts (jobs, annotations, log signals). A
 * completed attempt never changes, so a repeated report only downloads new
 * runs, and an interrupted one (rate limit) resumes where it stopped.
 */
export function createFileCache(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = key => path.join(directory, `${key.replace(/[^\w.-]+/g, '_')}.json`);
  return {
    get(key) {
      try {
        return JSON.parse(readFileSync(file(key), 'utf8'));
      } catch {
        return undefined;
      }
    },
    set(key, value) {
      const target = file(key);
      const partial = `${target}.${process.pid}.tmp`;
      writeFileSync(partial, JSON.stringify(value), { mode: 0o600 });
      renameSync(partial, target);
    },
  };
}

export const defaultCacheDirectory = () => path.join(tmpdir(), `ci-flake-report-cache-${process.getuid?.() ?? 'user'}`);

/* ---------------------------------- collecting ---------------------------------- */

/** Scans a job log for infrastructure causes; returns the matching kinds. */
export function scanLogForInfra(text) {
  // `launchBrowser` logs a recovered first start; only a start that stayed failed counts.
  const evidence = text.split('\n').filter(line => !RECOVERED_LAUNCH.test(line)).join('\n');
  const kinds = new Set();
  for (const { kind, pattern } of INFRA_PATTERNS) if (pattern.test(evidence)) kinds.add(kind);
  if (NETWORK_PATTERN.test(evidence)) kinds.add('network');
  return [...kinds];
}

async function fetchPages(api, endpoint, key) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const body = JSON.parse(await api(`${endpoint}${separator}per_page=${PAGE_SIZE}&page=${page}`));
    const batch = key ? body[key] : body;
    items.push(...batch);
    if (batch.length < PAGE_SIZE) return items;
  }
}

async function listRuns(api, repo, { runs, since }) {
  const created = since ? `created=${encodeURIComponent(`>=${since}`)}` : '';
  const endpoint = `repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs${created ? `?${created}` : ''}`;
  const collected = [];
  for (let page = 1; collected.length < runs; page += 1) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const body = JSON.parse(await api(`${endpoint}${separator}per_page=${PAGE_SIZE}&page=${page}`));
    collected.push(...body.workflow_runs);
    if (body.workflow_runs.length < PAGE_SIZE) break;
  }
  const sinceMs = since ? Date.parse(since) : -Infinity;
  return collected.filter(run => Date.parse(run.created_at) >= sinceMs).slice(0, runs);
}

function wantsAnnotations(job) {
  if (job.conclusion === 'skipped' || NON_BLOCKING_JOB.test(job.name) || AGGREGATE_JOB.test(job.name)) return false;
  if (RED_CONCLUSIONS.has(job.conclusion) || job.conclusion === 'cancelled') return true;
  return (job.steps || []).some(step => TEST_STEP.test(step.name) && step.conclusion !== 'skipped');
}

async function collectAttempt(api, repo, run, number, loadMeta, { withLogs, stats, cache }) {
  const key = `${repo}-${run.id}-${number}${withLogs ? '-logs' : ''}`;
  const cached = cache?.get(key);
  if (cached) {
    stats.logsUnavailable += cached.logsUnavailable;
    return cached.attempt;
  }
  const attemptMeta = await loadMeta();
  const jobs = await fetchPages(api, `repos/${repo}/actions/runs/${run.id}/attempts/${number}/jobs`, 'jobs');
  const detailed = [];
  let logsUnavailable = 0;
  for (const job of jobs) {
    const entry = {
      id: job.id,
      name: job.name,
      conclusion: job.conclusion,
      steps: (job.steps || []).map(step => ({ name: step.name, conclusion: step.conclusion })),
      annotations: [],
      logSignals: [],
    };
    if (wantsAnnotations(job)) {
      const annotations = await fetchPages(api, `repos/${repo}/check-runs/${job.id}/annotations`);
      entry.annotations = annotations.map(a => ({ level: a.annotation_level, title: a.title || '', message: a.message || '' }));
    }
    if (withLogs && RED_CONCLUSIONS.has(job.conclusion) && !AGGREGATE_JOB.test(job.name) && !NON_BLOCKING_JOB.test(job.name)) {
      try {
        entry.logSignals = scanLogForInfra(await api(`repos/${repo}/actions/jobs/${job.id}/logs`));
      } catch (error) {
        // Logs expire and may be hidden from the token; transient errors were already retried.
        if (!(error instanceof ReportError) || error.authProblem || error.networkProblem || error.rateLimited) throw error;
        logsUnavailable += 1;
      }
    }
    detailed.push(entry);
  }
  const attempt = {
    attempt: number,
    conclusion: attemptMeta.conclusion,
    startedAt: attemptMeta.run_started_at || attemptMeta.created_at,
    updatedAt: attemptMeta.updated_at,
    jobs: detailed,
  };
  cache?.set(key, { attempt, logsUnavailable });
  stats.logsUnavailable += logsUnavailable;
  return attempt;
}

/**
 * Downloads the newest completed runs with all their attempts, jobs,
 * annotations and (for failed jobs) log signals into a plain dataset.
 */
export async function collectRuns({ api, repo: requestedRepo, runs = DEFAULT_RUNS, since = null, concurrency = DEFAULT_CONCURRENCY, withLogs = true, cache = null }) {
  const repo = requestedRepo.includes('{') ? JSON.parse(await api(`repos/${requestedRepo}`)).full_name : requestedRepo;
  const listed = await listRuns(api, repo, { runs, since });
  const completed = listed.filter(run => run.status === 'completed');
  const stats = { logsUnavailable: 0 };
  const collected = await mapPool(completed, concurrency, async run => {
    const attempts = [];
    for (let number = 1; number <= run.run_attempt; number += 1) {
      const loadMeta = async () => (number === run.run_attempt
        ? run
        : JSON.parse(await api(`repos/${repo}/actions/runs/${run.id}/attempts/${number}`)));
      attempts.push(await collectAttempt(api, repo, run, number, loadMeta, { withLogs, stats, cache }));
    }
    return {
      id: run.id,
      event: run.event,
      branch: run.head_branch,
      sha: run.head_sha,
      actor: run.actor?.login ?? null,
      url: run.html_url,
      createdAt: run.created_at,
      pullRequest: run.pull_requests?.[0]?.number ?? null,
      conclusion: run.conclusion,
      attempts,
    };
  });
  return { repo, pending: listed.length - completed.length, logsUnavailable: stats.logsUnavailable, runs: collected };
}

/* ------------------------------- classification -------------------------------- */

const isRed = conclusion => RED_CONCLUSIONS.has(conclusion);

function fileFromAnnotation(message) {
  const match = /^([^\s:]+\.[cm]?[jt]sx?)\b/.exec(message);
  return match ? match[1] : null;
}

function relevantJobs(attempt) {
  return attempt.jobs.filter(job => !NON_BLOCKING_JOB.test(job.name) && !AGGREGATE_JOB.test(job.name));
}

/** Test files reported by the runner annotations of one attempt. */
export function testSignals(attempt) {
  const failed = [];
  const flaky = [];
  for (const job of relevantJobs(attempt)) {
    for (const annotation of job.annotations) {
      const file = fileFromAnnotation(annotation.message);
      if (!file) continue;
      if (annotation.title === 'Test failed') failed.push(file);
      else if (annotation.title === 'FLAKY test') flaky.push(file);
    }
  }
  return { failed: [...new Set(failed)], flaky: [...new Set(flaky)] };
}

/** Infrastructure causes of one failed job: its conclusion, failed step, annotations and log. */
function jobInfraSignals(job) {
  const found = [];
  const add = (kind, evidence) => {
    if (!found.some(item => item.kind === kind)) found.push({ kind, evidence });
  };
  if (job.conclusion === 'timed_out') add('job-timeout', job.name);
  const failedStep = job.steps.find(step => isRed(step.conclusion));
  if (failedStep && INFRA_STEP.test(failedStep.name)) add('setup-step', `${job.name}: ${failedStep.name}`);
  const texts = job.annotations.map(annotation => annotation.message);
  for (const { kind, pattern } of INFRA_PATTERNS) {
    if (texts.some(text => pattern.test(text))) add(kind, job.name);
  }
  const installing = failedStep && (DEPENDENCY_STEP.test(failedStep.name) || INFRA_STEP.test(failedStep.name));
  if (installing && texts.some(text => NETWORK_PATTERN.test(text))) add('network', job.name);
  for (const kind of job.logSignals) {
    if (kind === 'network' && !installing) continue;
    add(kind, `${job.name} (лог)`);
  }
  return found;
}

/**
 * Infrastructure causes of one attempt. The attempt is infrastructure only
 * when every failed job has one: a real test failure next to a Chrome start
 * timeout in another shard keeps it out of `infra`.
 */
export function infraSignals(attempt) {
  const failedJobs = relevantJobs(attempt).filter(job => isRed(job.conclusion));
  if (failedJobs.length === 0) {
    return attempt.conclusion === 'timed_out' ? [{ kind: 'job-timeout', evidence: 'run concluded timed_out' }] : [];
  }
  const perJob = failedJobs.map(jobInfraSignals);
  if (perJob.some(signals => signals.length === 0)) return [];
  const merged = [];
  for (const item of perJob.flat()) if (!merged.some(known => known.kind === item.kind)) merged.push(item);
  return merged;
}

function prNumberOf(run) {
  if (run.pullRequest) return run.pullRequest;
  const queued = /^gh-readonly-queue\/[^/]+\/pr-(\d+)-/.exec(run.branch || '');
  return queued ? Number(queued[1]) : null;
}

const finalAttempt = run => run.attempts[run.attempts.length - 1];
const runSucceeded = run => finalAttempt(run).conclusion === 'success';

/**
 * Decides whether the same code later went green, which makes a red attempt
 * flaky: a later attempt of this run, or another run of the same head SHA, or
 * (merge queue, whose head SHA is a throwaway) a later green queue run of the
 * same pull request with no new pull-request commit in between.
 */
function laterGreen(run, attemptIndex, allRuns) {
  const attempt = run.attempts[attemptIndex];
  if (run.attempts.slice(attemptIndex + 1).some(next => next.conclusion === 'success')) {
    return { reason: `rerun of the same run passed (attempt ${run.attempts.findIndex((a, i) => i > attemptIndex && a.conclusion === 'success') + 1})` };
  }
  const failedAt = Date.parse(attempt.startedAt || run.createdAt);
  const later = allRuns.filter(other => other.id !== run.id && Date.parse(other.createdAt) >= failedAt && runSucceeded(other));
  const sameSha = later.find(other => other.sha === run.sha);
  if (sameSha) return { reason: `same commit passed in run ${sameSha.id}` };
  if (run.event === 'merge_group') {
    const pr = prNumberOf(run);
    if (pr !== null) {
      const green = later
        .filter(other => other.event === 'merge_group' && prNumberOf(other) === pr)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
      if (green) {
        const edited = allRuns.some(other => other.event === 'pull_request' && prNumberOf(other) === pr
          && Date.parse(other.createdAt) > failedAt && Date.parse(other.createdAt) < Date.parse(green.createdAt));
        if (!edited) return { reason: `PR #${pr} passed the queue in run ${green.id} without new commits` };
      }
    }
  }
  return null;
}

/** Classifies one non-green attempt: cancelled / infra / flaky / real. */
export function classifyAttempt(run, attemptIndex, allRuns) {
  const attempt = run.attempts[attemptIndex];
  if (attempt.conclusion === 'cancelled') return { kind: 'cancelled', reason: 'run was cancelled' };
  const infra = infraSignals(attempt);
  if (infra.length > 0) return { kind: 'infra', reason: infra.map(item => `${item.kind} (${item.evidence})`).join('; ') };
  const recovered = laterGreen(run, attemptIndex, allRuns);
  if (recovered) return { kind: 'flaky', reason: recovered.reason };
  return { kind: 'real', reason: 'no later green run of the same code' };
}

/* ---------------------------------- aggregates ---------------------------------- */

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Nearest-rank percentile, `fraction` in (0, 1]. */
export function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

const share = (part, whole) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);
const durationMs = attempt => Math.max(0, Date.parse(attempt.updatedAt) - Date.parse(attempt.startedAt));

function orderedEvents(events) {
  const known = EVENT_ORDER.filter(event => events.includes(event));
  return [...known, ...events.filter(event => !EVENT_ORDER.includes(event)).sort()];
}

function topCounts(entries, top) {
  const counts = new Map();
  for (const { key, runId } of entries) {
    const row = counts.get(key) || { count: 0, runs: new Set() };
    row.count += 1;
    row.runs.add(runId);
    counts.set(key, row);
  }
  return [...counts.entries()]
    .map(([name, row]) => ({ name, count: row.count, runs: row.runs.size }))
    .sort((a, b) => b.count - a.count || b.runs - a.runs || a.name.localeCompare(b.name))
    .slice(0, top);
}

const shardless = name => name.replace(/\s*\(shard [^)]*\)\s*$/i, '');

function summarize(runs, redAttempts) {
  const green = runs.filter(runSucceeded);
  const red = runs.filter(run => isRed(finalAttempt(run).conclusion));
  const cancelled = runs.filter(run => finalAttempt(run).conclusion === 'cancelled');
  const rerunGreen = green.filter(run => run.attempts.slice(0, -1).some(attempt => isRed(attempt.conclusion)));
  const timed = runs.filter(run => finalAttempt(run).conclusion !== 'cancelled').map(run => durationMs(finalAttempt(run)));
  const classes = { real: 0, flaky: 0, infra: 0, cancelled: 0 };
  for (const attempt of redAttempts) classes[attempt.class] += 1;
  return {
    runs: runs.length,
    green: green.length,
    red: red.length,
    cancelled: cancelled.length,
    other: runs.length - green.length - red.length - cancelled.length,
    redPercent: share(red.length, runs.length),
    notGreenPercent: share(runs.length - green.length, runs.length),
    rerunGreen: rerunGreen.length,
    rerunGreenPercent: share(rerunGreen.length, runs.length),
    classification: { ...classes, total: redAttempts.length },
    duration: { runs: timed.length, medianSeconds: seconds(median(timed)), p90Seconds: seconds(percentile(timed, 0.9)) },
  };
}

const seconds = ms => (ms === null ? null : Math.round(ms / 100) / 10);

/** Builds the report object from a collected dataset (pure). */
export function buildReport(dataset, { top = DEFAULT_TOP, now = () => new Date() } = {}) {
  const runs = dataset.runs;
  const redAttempts = [];
  const failEntries = [];
  const flakyEntries = [];
  const jobEntries = [];
  for (const run of runs) {
    run.attempts.forEach((attempt, index) => {
      const signals = testSignals(attempt);
      for (const file of signals.failed) failEntries.push({ key: file, runId: run.id });
      for (const file of signals.flaky) flakyEntries.push({ key: file, runId: run.id });
      if (isRed(attempt.conclusion) || attempt.conclusion === 'cancelled') {
        const verdict = classifyAttempt(run, index, runs);
        const failedJobs = relevantJobs(attempt).filter(job => isRed(job.conclusion)).map(job => job.name);
        if (verdict.kind !== 'cancelled') for (const name of failedJobs) jobEntries.push({ key: shardless(name), runId: run.id });
        redAttempts.push({
          runId: run.id,
          attempt: attempt.attempt,
          event: run.event,
          branch: run.branch,
          actor: run.actor,
          sha: run.sha,
          url: run.url,
          conclusion: attempt.conclusion,
          class: verdict.kind,
          reason: verdict.reason,
          failedJobs,
          failedTests: signals.failed,
        });
      }
    });
  }

  const greenRuns = runs.filter(runSucceeded);
  const greenWithFlaky = greenRuns.filter(run => testSignals(finalAttempt(run)).flaky.length > 0);
  const events = orderedEvents([...new Set(runs.map(run => run.event))]);
  const byEvent = Object.fromEntries(events.map(event => [
    event,
    summarize(runs.filter(run => run.event === event), redAttempts.filter(attempt => attempt.event === event)),
  ]));
  const created = runs.map(run => Date.parse(run.createdAt)).sort((a, b) => a - b);
  return {
    generatedAt: now().toISOString(),
    repository: dataset.repo,
    workflow: WORKFLOW_FILE,
    window: {
      from: created.length ? new Date(created[0]).toISOString() : null,
      to: created.length ? new Date(created[created.length - 1]).toISOString() : null,
      completedRuns: runs.length,
      pendingRuns: dataset.pending,
      logsUnavailable: dataset.logsUnavailable,
    },
    totals: summarize(runs, redAttempts),
    byEvent,
    greenWithFlaky: {
      greenRuns: greenRuns.length,
      withFlaky: greenWithFlaky.length,
      percent: share(greenWithFlaky.length, greenRuns.length),
    },
    topFail: topCounts(failEntries, top),
    topFlaky: topCounts(flakyEntries, top),
    topFailedJobs: topCounts(jobEntries, top),
    redAttempts,
  };
}

/* ----------------------------------- rendering ----------------------------------- */

const pct = value => `${value.toFixed(1).replace('.', ',')}%`;
const minutes = value => (value === null ? '—' : `${(value / 60).toFixed(1).replace('.', ',')} мин`);
// Backslash first, so the one added in front of `|` is not escaped again; a line break would end the row.
const cell = text => String(text).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function table(headers, rows) {
  if (rows.length === 0) return '_нет данных_\n';
  const lines = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${row.map(cell).join(' | ')} |`);
  return `${lines.join('\n')}\n`;
}

export function renderMarkdown(report) {
  const { totals, byEvent, window } = report;
  const rows = [...Object.entries(byEvent), ['Всего', totals]];
  const out = [];
  out.push(`# CI: красные прогоны и flaky-тесты (${report.workflow})`, '');
  out.push(`Репозиторий: ${report.repository}. Окно: ${window.from ?? '—'} … ${window.to ?? '—'}, завершённых прогонов: ${window.completedRuns}`
    + (window.pendingRuns ? ` (ещё идут и не учтены: ${window.pendingRuns})` : '') + '.');
  if (window.logsUnavailable) out.push(`Логи ${window.logsUnavailable} упавших джобов недоступны (истекли) — для них infra определялась без логов.`);
  out.push('');
  out.push('## Прогоны по событиям', '');
  out.push(table(
    ['Событие', 'Прогонов', 'Зелёных', 'Красных', 'Красных %', 'Отменено', 'Красные+отменённые %', 'Позеленели после повтора', 'После повтора %'],
    rows.map(([event, item]) => [event, item.runs, item.green, item.red, pct(item.redPercent), item.cancelled,
      pct(item.notGreenPercent), item.rerunGreen, pct(item.rerunGreenPercent)]),
  ));
  out.push('Красный прогон — итоговая попытка завершилась failure/timed_out. «После повтора» — итог зелёный, но более ранняя попытка была красной.', '');
  out.push('## Классификация красных попыток', '');
  out.push(table(
    ['Событие', 'real', 'flaky', 'infra', 'cancelled', 'Всего'],
    rows.map(([event, item]) => [event, item.classification.real, item.classification.flaky, item.classification.infra,
      item.classification.cancelled, item.classification.total]),
  ));
  out.push('## Длительность прогона (без отменённых)', '');
  out.push(table(
    ['Событие', 'Прогонов', 'Медиана', 'p90'],
    rows.map(([event, item]) => [event, item.duration.runs, minutes(item.duration.medianSeconds), minutes(item.duration.p90Seconds)]),
  ));
  const flakyGreen = report.greenWithFlaky;
  out.push('## Зелёные прогоны с FLAKY', '');
  out.push(`${flakyGreen.withFlaky} из ${flakyGreen.greenRuns} зелёных прогонов (${pct(flakyGreen.percent)}) содержат хотя бы один FLAKY-тест в итоговой попытке.`, '');
  const topRows = items => items.map(item => [item.name, item.count, item.runs]);
  out.push('## Топ тест-файлов по FAIL', '', table(['Файл', 'Падений', 'Прогонов'], topRows(report.topFail)));
  out.push('## Топ тест-файлов по FLAKY', '', table(['Файл', 'FLAKY', 'Прогонов'], topRows(report.topFlaky)));
  out.push('## Топ упавших джобов (без отменённых)', '', table(['Джоб', 'Падений', 'Прогонов'], topRows(report.topFailedJobs)));
  out.push('## Красные и отменённые попытки', '');
  out.push(table(
    ['Прогон', 'Попытка', 'Событие', 'Ветка', 'Класс', 'Почему'],
    report.redAttempts.map(item => [`[${item.runId}](${item.url})`, item.attempt, item.event, item.branch, item.class, item.reason]),
  ));
  return `${out.join('\n')}\n`;
}

/* ------------------------------------- CLI ------------------------------------- */

const USAGE = 'Использование: npm run ci:flake-report -- [--runs N] [--since ISO] [--json] [--top N] [--repo OWNER/NAME] [--concurrency N] [--no-logs] [--cache-dir DIR | --no-cache]';

function positiveInteger(name, text) {
  if (!/^[1-9]\d*$/.test(text)) throw new ReportError(`${name} должен быть положительным целым, получено «${text}». ${USAGE}`, 2);
  return Number(text);
}

export function parseCliArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        runs: { type: 'string' },
        since: { type: 'string' },
        json: { type: 'boolean', default: false },
        top: { type: 'string' },
        repo: { type: 'string' },
        concurrency: { type: 'string' },
        'no-logs': { type: 'boolean', default: false },
        'no-cache': { type: 'boolean', default: false },
        'cache-dir': { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
      allowPositionals: false,
    }).values;
  } catch (error) {
    throw new ReportError(`${error.message}. ${USAGE}`, 2);
  }
  if (parsed.since !== undefined && Number.isNaN(Date.parse(parsed.since))) {
    throw new ReportError(`--since ожидает дату ISO 8601, получено «${parsed.since}». ${USAGE}`, 2);
  }
  if (parsed.repo !== undefined && !/^[\w.-]+\/[\w.-]+$/.test(parsed.repo)) {
    throw new ReportError(`--repo ожидает OWNER/NAME, получено «${parsed.repo}».`, 2);
  }
  return {
    help: parsed.help,
    json: parsed.json,
    since: parsed.since ?? null,
    repo: parsed.repo ?? '{owner}/{repo}',
    runs: parsed.runs === undefined ? DEFAULT_RUNS : positiveInteger('--runs', parsed.runs),
    top: parsed.top === undefined ? DEFAULT_TOP : positiveInteger('--top', parsed.top),
    concurrency: parsed.concurrency === undefined ? DEFAULT_CONCURRENCY : positiveInteger('--concurrency', parsed.concurrency),
    withLogs: !parsed['no-logs'],
    cacheDirectory: parsed['no-cache'] ? null : (parsed['cache-dir'] ?? defaultCacheDirectory()),
  };
}

/** Runs the CLI; returns the exit code. All I/O goes through the injected dependencies. */
export async function main(argv, {
  api = createGhApi(),
  stdout = process.stdout,
  stderr = process.stderr,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = () => new Date(),
} = {}) {
  try {
    const options = parseCliArgs(argv);
    if (options.help) {
      stdout.write(`${USAGE}\n`);
      return 0;
    }
    const cache = options.cacheDirectory ? createFileCache(options.cacheDirectory) : null;
    const dataset = await collectRuns({ ...options, cache, api: withRetry(api, { sleep }) });
    const report = buildReport(dataset, { top: options.top, now });
    stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report));
    return 0;
  } catch (error) {
    if (error instanceof ReportError) {
      stderr.write(`ci-flake-report: ${error.message}\n`);
      return error.exitCode;
    }
    stderr.write(`ci-flake-report: непредвиденная ошибка: ${error.stack || error.message}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
