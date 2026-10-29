#!/usr/bin/env node
/**
 * Plans the test shards of one CI run (the `plan` job of ci.yml).
 *
 *   node scripts/ci-test-plan.mjs --event <github event name> [--base <sha> --head <sha>]
 *
 * Only a pull request is narrowed: it runs the test files that
 * `scripts/ci-affected-tests.mjs` selects, in as many shards as they need, and
 * no test shard at all for a documentation-only change. The merge queue, a push
 * and a manual run always run every shard. So does a pull request whose
 * selection failed: a non-zero exit, a timeout, an output that was not written,
 * does not parse or names a file outside the registry. A broken plan can cost
 * minutes, never hide a test.
 *
 * Appends to $GITHUB_OUTPUT (stdout without it): `mode`, `reason`,
 * `registry-shards` and `browser-shards` (`[1, …, N]`, `[]` skips the job) and
 * `affected-tests`, the engine's output exactly as written, for
 * `--only-files`; it is empty unless the run is narrowed.
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync, mkdtempSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { singleLineErrorMessage } from './lib/diagnostic-text-policy.mjs';

/** Shards of a full run; ci.yml takes its matrices from this plan. */
export const FULL_SHARDS = Object.freeze({ registry: 2, browser: 9 });
const ENGINE_TIMEOUT_MS = 120_000;
const USAGE = 'usage: node scripts/ci-test-plan.mjs --event <name> [--base <sha> --head <sha>]';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = path.join(root, 'scripts', 'ci-affected-tests.mjs');

function shardList(count) {
  return Array.from({ length: count }, (_, index) => index + 1);
}

/** Keeps the files per shard of a full run: a selection of k of n files gets ceil(k * full / n) shards. */
function shardsFor(selected, total, full) {
  if (selected === 0) return [];
  return shardList(Math.min(full, Math.ceil((selected * full) / total)));
}

function everyShard(reason) {
  return {
    mode: 'all',
    reason,
    registryShards: shardList(FULL_SHARDS.registry),
    browserShards: shardList(FULL_SHARDS.browser),
    affectedTests: '',
  };
}

/**
 * The plan for one run, from the engine's exit status and the text it wrote
 * (`null` when it wrote nothing). Pure: the caller runs the engine.
 */
export function planTestShards({ event, status, output, registry }) {
  if (event !== 'pull_request') return everyShard(`${event} always runs every test`);
  if (status !== 0) return everyShard(`affected-test selection failed (exit ${status}); running everything`);
  if (output === null || output.trim() === '') {
    return everyShard('affected-test selection was not written; running everything');
  }
  let selection;
  try {
    selection = JSON.parse(output);
  } catch {
    return everyShard('affected-test selection is not JSON; running everything');
  }
  const registered = new Map(registry.suites.flatMap(suite => suite.files.map(file => [file, suite.id])));
  const files = selection?.files;
  const lists = files && typeof files === 'object' && !Array.isArray(files) ? Object.values(files) : null;
  if (!['all', 'subset', 'none'].includes(selection?.mode) || lists === null
    || !lists.every(list => Array.isArray(list) && list.every(file => registered.has(file)))) {
    return everyShard('affected-test selection is malformed; running everything');
  }
  if (selection.mode === 'all') return everyShard(String(selection.reason));

  const quarantined = new Set((registry.quarantine ?? []).map(entry => entry.file));
  const runnable = file => !quarantined.has(file);
  const count = (fileList, inBrowser) => fileList
    .filter(file => (registered.get(file) === 'browser') === inBrowser && runnable(file)).length;
  const allFiles = [...registered.keys()];
  const chosen = lists.flat();
  return {
    mode: selection.mode,
    reason: String(selection.reason),
    registryShards: shardsFor(count(chosen, false), count(allFiles, false), FULL_SHARDS.registry),
    browserShards: shardsFor(count(chosen, true), count(allFiles, true), FULL_SHARDS.browser),
    affectedTests: selection.mode === 'subset' ? output : '',
  };
}

/** `name=value` lines, with a heredoc delimiter for the multi-line selection. */
export function formatGithubOutput(plan) {
  const delimiter = `affected_tests_${randomUUID()}`;
  return [
    `mode=${plan.mode}`,
    `reason=${plan.reason.replace(/\s+/g, ' ')}`,
    `registry-shards=${JSON.stringify(plan.registryShards)}`,
    `browser-shards=${JSON.stringify(plan.browserShards)}`,
    `affected-tests<<${delimiter}`,
    ...(plan.affectedTests === '' ? [] : [plan.affectedTests.replace(/\n$/, '')]),
    delimiter,
    '',
  ].join('\n');
}

export function parsePlanArguments(args) {
  const options = { event: null, base: null, head: null };
  const flags = new Map([['--event', 'event'], ['--base', 'base'], ['--head', 'head']]);
  const rest = [...args];
  while (rest.length > 0) {
    const key = flags.get(rest.shift());
    const value = rest.shift();
    if (!key || value === undefined || options[key] !== null) throw new Error(USAGE);
    options[key] = value;
  }
  if (!options.event) throw new Error(USAGE);
  return options;
}

/** Runs the engine for a pull request; any other event needs no selection. */
function runEngine({ event, base, head }, cwd) {
  if (event !== 'pull_request') return { status: 0, output: null };
  // The same answer the engine gives a missing revision: a usage error.
  if (!base || !head) return { status: 2, output: null };
  const directory = mkdtempSync(path.join(tmpdir(), 'ci-test-plan-'));
  const outputPath = path.join(directory, 'affected-tests.json');
  try {
    const result = spawnSync(process.execPath, [ENGINE, '--base', base, '--head', head, '--output', outputPath], {
      cwd, encoding: 'utf8', timeout: ENGINE_TIMEOUT_MS, stdio: ['ignore', 'inherit', 'inherit'],
    });
    let output = null;
    try {
      output = readFileSync(outputPath, 'utf8');
    } catch {
      // Not written: planTestShards runs everything.
    }
    return { status: result.status ?? result.signal ?? 'timeout', output };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function main(args = process.argv.slice(2), { env = process.env, stdout = process.stdout, cwd = process.cwd() } = {}) {
  const options = parsePlanArguments(args);
  const { status, output } = runEngine(options, cwd);
  const registry = JSON.parse(readFileSync(path.join(root, 'tests', 'test-suites.json'), 'utf8'));
  const plan = planTestShards({ event: options.event, status, output, registry });
  const text = formatGithubOutput(plan);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, text);
  else stdout.write(text);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY,
      `Test plan: **${plan.mode}**, ${plan.registryShards.length} registry and ${plan.browserShards.length} browser shard(s). ${plan.reason}\n`);
  }
  return plan;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[ci-test-plan] ${singleLineErrorMessage(error)}\n`);
    process.exitCode = error.message === USAGE ? 2 : 1;
  }
}
