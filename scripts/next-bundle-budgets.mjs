#!/usr/bin/env node
/**
 * Next.js route bundle budgets: one measured baseline file per route, a shared
 * tolerance, and explicit per-change approval files for growth above it.
 *
 * Branches never edit a shared ceiling. They are measured against the
 * baselines plus the tolerance; growth beyond it needs a new file in
 * `approvals/`, visible in the pull request. `baseline` rewrites the baselines
 * from a main CI measurement and retires the approvals that measurement
 * already contains.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const POLICY_PATH = 'config/next-bundle-budgets.json';
export const BASELINE_DIR = 'config/next-bundle-budgets/baselines';
export const APPROVAL_DIR = 'config/next-bundle-budgets/approvals';
export const MEASUREMENTS_PATH = 'tmp/next-bundle-measurements.json';
export const MEASUREMENT_ARTIFACT_PREFIX = 'next-bundle-measurements-';
export const BUDGET_KINDS = ['jsGzipBytes', 'cssGzipBytes'];

// The release SHA is compiled into a few chunks (`releaseId:"<sha>"`, or
// "development" without RELEASE_SHA) and changes their content hashes, which
// other chunks reference. Both depend on the build environment rather than the
// source, so they are replaced with fixed-length placeholders before gzip.
// The residual difference between a local and a CI build is the minifier's
// name choice: a few bytes, far below the tolerance.
export const RELEASE_ID_PATTERN = /releaseId:"(?:development|[0-9a-f]{7,40})"/g;
const CHUNK_HASH_PATTERN = /(?<=[-."])[0-9a-f]{16}(?=[".])/g;

export function normalizeAsset(source) {
  return String(source)
    .replace(RELEASE_ID_PATTERN, 'releaseId:"0000000000000000000000000000000000000000"')
    .replace(CHUNK_HASH_PATTERN, '0000000000000000');
}

export function normalizedGzipBytes(source) {
  return gzipSync(normalizeAsset(source), { level: 6 }).length;
}

/** `/` -> `home`, `/standard/cards/standard/` -> `standard--cards--standard`. */
export function routeSlug(route) {
  const trimmed = String(route).replace(/^\/+|\/+$/g, '');
  return trimmed ? trimmed.replaceAll('/', '--') : 'home';
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(file => file.endsWith('.json')).sort();
}

function isByteCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function loadBudgetConfig(root = PROJECT_ROOT) {
  const policy = readJson(join(root, POLICY_PATH));
  const errors = [];
  if (policy.schemaVersion !== 2) errors.push(`${POLICY_PATH}: schemaVersion must be 2`);
  const { ratio, minBytes } = policy.tolerance ?? {};
  if (!(ratio >= 0 && ratio < 1) || !isByteCount(minBytes)) {
    errors.push(`${POLICY_PATH}: tolerance needs 0 <= ratio < 1 and a non-negative integer minBytes`);
  }

  const baselines = {};
  for (const file of jsonFiles(join(root, BASELINE_DIR))) {
    const data = readJson(join(root, BASELINE_DIR, file));
    const where = `${BASELINE_DIR}/${file}`;
    if (typeof data.route !== 'string' || !data.route.startsWith('/') || !data.route.endsWith('/')) {
      errors.push(`${where}: route must be an absolute path with a trailing slash`);
      continue;
    }
    if (file !== `${routeSlug(data.route)}.json`) errors.push(`${where}: file name must be ${routeSlug(data.route)}.json`);
    for (const kind of BUDGET_KINDS) {
      if (!isByteCount(data[kind])) errors.push(`${where}: ${kind} must be a non-negative integer`);
    }
    baselines[data.route] = { jsGzipBytes: data.jsGzipBytes, cssGzipBytes: data.cssGzipBytes, file: where };
  }
  if (!Object.keys(baselines).length) errors.push(`${BASELINE_DIR}: no route baselines`);

  const approvals = [];
  for (const file of jsonFiles(join(root, APPROVAL_DIR))) {
    const data = readJson(join(root, APPROVAL_DIR, file));
    const where = `${APPROVAL_DIR}/${file}`;
    if (typeof data.reason !== 'string' || data.reason.trim().length < 10) {
      errors.push(`${where}: reason must explain the growth (at least 10 characters)`);
    }
    const routes = Object.entries(data.routes ?? {});
    if (!routes.length) errors.push(`${where}: routes must list at least one route`);
    for (const [route, extra] of routes) {
      if (!baselines[route]) errors.push(`${where}: ${route} has no baseline`);
      for (const [kind, bytes] of Object.entries(extra ?? {})) {
        if (!BUDGET_KINDS.includes(kind)) errors.push(`${where}: ${route} has unknown key ${kind}`);
        else if (!isByteCount(bytes) || bytes === 0) errors.push(`${where}: ${route} ${kind} must be a positive integer`);
      }
    }
    approvals.push({ file: where, reason: data.reason, routes: data.routes ?? {} });
  }

  return { tolerance: { ratio, minBytes }, baselines, approvals, errors };
}

export function toleranceBytes(baseline, { ratio, minBytes }) {
  return Math.max(Math.ceil(baseline * ratio), minBytes);
}

/** Limit per route and kind: baseline + tolerance + every approval for it. */
export function budgetLimits({ baselines, approvals, tolerance }) {
  return Object.fromEntries(Object.entries(baselines).map(([route, baseline]) => [route,
    Object.fromEntries(BUDGET_KINDS.map(kind => [kind, baseline[kind] + toleranceBytes(baseline[kind], tolerance)
      + approvals.reduce((sum, approval) => sum + (approval.routes[route]?.[kind] ?? 0), 0)]))]));
}

export function evaluateBudgets({ baselines, approvals, tolerance, measured }) {
  const limits = budgetLimits({ baselines, approvals, tolerance });
  const failures = [];
  for (const [route, limit] of Object.entries(limits)) {
    const sizes = measured[route];
    if (!sizes) { failures.push(`${route}: not measured`); continue; }
    for (const kind of BUDGET_KINDS) {
      if (sizes[kind] > limit[kind]) {
        const need = sizes[kind] - limit[kind];
        failures.push(`${route} ${kind}: ${sizes[kind]} > ${limit[kind]} (baseline ${baselines[route][kind]}; `
          + `approve at least ${need} B in ${APPROVAL_DIR}/<change>.json)`);
      }
    }
  }
  return { limits, failures };
}

export function measurementReport(measured, env = process.env) {
  return {
    schemaVersion: 1,
    commit: env.GITHUB_SHA || gitOrNull(['rev-parse', 'HEAD']),
    event: env.GITHUB_EVENT_NAME || 'local',
    normalization: 'release-id+chunk-hash',
    routes: measured,
  };
}

export function writeMeasurements(report, root = PROJECT_ROOT) {
  const path = join(root, MEASUREMENTS_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

function gitOrNull(args, cwd = PROJECT_ROOT) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * Rewrites every measured route's baseline and deletes the approvals that the
 * measured commit already contained: their growth is now part of the baseline.
 * Approvals merged after that commit stay, so main keeps passing.
 */
export function refreshBaselines({ report, root = PROJECT_ROOT, approvalsAtCommit }) {
  const written = [];
  mkdirSync(join(root, BASELINE_DIR), { recursive: true });
  const known = new Set(jsonFiles(join(root, BASELINE_DIR)).map(file => readJson(join(root, BASELINE_DIR, file)).route));
  for (const [route, sizes] of Object.entries(report.routes)) {
    if (!known.has(route)) continue;
    const file = `${BASELINE_DIR}/${routeSlug(route)}.json`;
    writeFileSync(join(root, file), `${JSON.stringify({
      route, jsGzipBytes: sizes.jsGzipBytes, cssGzipBytes: sizes.cssGzipBytes, measuredAt: report.commit ?? 'unknown',
    }, null, 2)}\n`);
    written.push(file);
  }
  const removed = [];
  for (const file of jsonFiles(join(root, APPROVAL_DIR))) {
    const path = `${APPROVAL_DIR}/${file}`;
    if (approvalsAtCommit.has(path)) { unlinkSync(join(root, path)); removed.push(path); }
  }
  return { written, removed };
}

function gh(args) {
  return execFileSync('gh', args, { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

function latestMainMeasurement() {
  // REST instead of `gh run list` filters: the server's gh 2.23 has no --event/--status.
  const runs = JSON.parse(gh(['api', 'repos/{owner}/{repo}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=10',
    '--jq', '[.workflow_runs[] | {databaseId: .id, headSha: .head_sha}]']));
  const dir = mkdtempSync(join(tmpdir(), 'next-bundle-measurements-'));
  try {
    for (const run of runs) {
      try {
        execFileSync('gh', ['run', 'download', String(run.databaseId), '--name', `${MEASUREMENT_ARTIFACT_PREFIX}${run.headSha}`, '--dir', dir],
          { cwd: PROJECT_ROOT, stdio: 'ignore' });
        return readJson(join(dir, 'next-bundle-measurements.json'));
      } catch { /* older runs predate the artifact */ }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  throw new Error('no successful main CI run has a bundle measurement artifact');
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command !== 'baseline') {
    console.log([
      'Usage: npm run budget:next:baseline -- [--from <measurements.json>]',
      '',
      `Without --from, downloads ${MEASUREMENT_ARTIFACT_PREFIX}<sha> from the newest successful main CI run.`,
      `--from accepts ${MEASUREMENTS_PATH} written by \`npm run budget:next\` (bootstrap or a new route only).`,
    ].join('\n'));
    process.exit(command ? 1 : 0);
  }
  const fromIndex = rest.indexOf('--from');
  const report = fromIndex === -1 ? latestMainMeasurement() : readJson(resolve(rest[fromIndex + 1] ?? ''));
  if (report.normalization !== 'release-id+chunk-hash') throw new Error('measurement uses another normalization');
  const atCommit = report.commit
    ? gitOrNull(['ls-tree', '--name-only', `${report.commit}`, `${APPROVAL_DIR}/`])
    : null;
  if (atCommit === null && fromIndex === -1) throw new Error(`commit ${report.commit} is not available locally: git fetch origin main`);
  const approvalsAtCommit = new Set((atCommit ?? '').split('\n').filter(Boolean));
  const config = loadBudgetConfig();
  if (config.errors.length) throw new Error(config.errors.join('\n'));
  const { failures } = evaluateBudgets({ ...config, measured: report.routes });
  if (failures.length) throw new Error(`refusing to adopt a measurement that exceeds its own limits:\n${failures.join('\n')}`);
  const { written, removed } = refreshBaselines({ report, approvalsAtCommit });
  console.log(`baselines from ${report.commit ?? 'local build'}: ${written.length} routes; retired approvals: ${removed.length ? removed.join(', ') : 'none'}`);
  console.log(`Commit ${BASELINE_DIR} and ${APPROVAL_DIR} in a dedicated PR.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
