import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TEST_SUITE_IDS = Object.freeze([
  'unit',
  'integration',
  'contract',
  'browser',
  'production-smoke',
]);

const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs|sh)$/;
const IGNORED_DIRECTORY_NAMES = new Set([
  '.codegraph',
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'storybook-static',
  'test-results',
]);
const ENVIRONMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ISSUE_URL_PATTERN = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/[1-9][0-9]*$/;
const QUARANTINE_MODES = Object.freeze(['exclude', 'only']);
const FORCE_KILL_DELAY_MS = 1_000;
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectTestFiles(directory, repositoryRoot, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
      collectTestFiles(path.join(directory, entry.name), repositoryRoot, files);
      continue;
    }
    if (!entry.isFile() || !TEST_FILE_PATTERN.test(entry.name)) continue;
    files.push(path.relative(repositoryRoot, path.join(directory, entry.name)).split(path.sep).join('/'));
  }
}

export function discoverTestFiles(repositoryRoot) {
  const files = [];
  collectTestFiles(repositoryRoot, repositoryRoot, files);
  return files.sort();
}

function validateTestPath(testFile) {
  const normalizedPath = typeof testFile === 'string' ? path.posix.normalize(testFile) : '';
  const safe = typeof testFile === 'string'
    && testFile.length > 0
    && !testFile.includes('\0')
    && !testFile.includes('\\')
    && !path.posix.isAbsolute(testFile)
    && normalizedPath === testFile
    && !testFile.startsWith('../')
    && TEST_FILE_PATTERN.test(testFile);
  if (!safe) throw new Error(`unsafe test path: ${String(testFile)}`);
}

function validateEnvironment(environment, label) {
  if (!isRecord(environment)) throw new Error(`${label} must be an object`);
  for (const [name, value] of Object.entries(environment)) {
    if (!ENVIRONMENT_NAME_PATTERN.test(name)) {
      throw new Error(`invalid environment variable name: ${name}`);
    }
    if (typeof value !== 'string') {
      throw new Error(`environment variable ${name} must be a string`);
    }
  }
}

function countFiles(files) {
  const counts = new Map();
  for (const testFile of files) counts.set(testFile, (counts.get(testFile) ?? 0) + 1);
  return counts;
}

export function validateTestRegistry(registry, { repositoryRoot }) {
  if (!isRecord(registry)) throw new Error('test registry must be an object');
  if (registry.version !== 1) throw new Error('test registry version must be 1');
  if (!Array.isArray(registry.suites)) throw new Error('test registry suites must be an array');
  if (!Array.isArray(registry.exclusions)) throw new Error('test registry exclusions must be an array');
  if (!isRecord(registry.fileEnvironment)) {
    throw new Error('test registry fileEnvironment must be an object');
  }

  const expectedSuiteIds = new Set(TEST_SUITE_IDS);
  const suiteIds = new Set();
  const classifiedFiles = [];
  const countsBySuite = Object.fromEntries(TEST_SUITE_IDS.map(id => [id, 0]));
  for (const suite of registry.suites) {
    if (!isRecord(suite) || typeof suite.id !== 'string' || !expectedSuiteIds.has(suite.id)) {
      throw new Error(`unsupported test suite: ${String(suite?.id)}`);
    }
    if (suiteIds.has(suite.id)) throw new Error(`duplicate test suite: ${suite.id}`);
    if (!Array.isArray(suite.files)) throw new Error(`test suite ${suite.id} files must be an array`);
    suiteIds.add(suite.id);
    countsBySuite[suite.id] = suite.files.length;
    for (const testFile of suite.files) {
      validateTestPath(testFile);
      classifiedFiles.push(testFile);
    }
  }
  const missingSuites = TEST_SUITE_IDS.filter(id => !suiteIds.has(id));
  if (missingSuites.length > 0) throw new Error(`missing test suites: ${missingSuites.join(', ')}`);

  const duplicateFiles = [...countFiles(classifiedFiles)]
    .filter(([, count]) => count > 1)
    .map(([testFile]) => testFile)
    .sort();
  if (duplicateFiles.length > 0) {
    throw new Error(`classified more than once: ${duplicateFiles.join(', ')}`);
  }

  const excludedFiles = [];
  for (const exclusion of registry.exclusions) {
    if (!isRecord(exclusion)) throw new Error('each test exclusion must be an object');
    validateTestPath(exclusion.file);
    if (typeof exclusion.reason !== 'string' || exclusion.reason.trim().length === 0) {
      throw new Error(`exclusion reason is required: ${exclusion.file}`);
    }
    excludedFiles.push(exclusion.file);
  }
  const duplicateExclusions = [...countFiles(excludedFiles)]
    .filter(([, count]) => count > 1)
    .map(([testFile]) => testFile)
    .sort();
  if (duplicateExclusions.length > 0) {
    throw new Error(`excluded more than once: ${duplicateExclusions.join(', ')}`);
  }

  const classifiedSet = new Set(classifiedFiles);
  const excludedSet = new Set(excludedFiles);
  const classifiedAndExcluded = classifiedFiles.filter(testFile => excludedSet.has(testFile)).sort();
  if (classifiedAndExcluded.length > 0) {
    throw new Error(`test cannot be classified and excluded: ${classifiedAndExcluded.join(', ')}`);
  }

  const discoveredFiles = discoverTestFiles(repositoryRoot);
  const discoveredSet = new Set(discoveredFiles);
  const staleClassifications = classifiedFiles.filter(testFile => !discoveredSet.has(testFile)).sort();
  if (staleClassifications.length > 0) {
    throw new Error(`classified test does not exist: ${staleClassifications.join(', ')}`);
  }
  const staleExclusions = excludedFiles.filter(testFile => !discoveredSet.has(testFile)).sort();
  if (staleExclusions.length > 0) {
    throw new Error(`excluded test does not exist: ${staleExclusions.join(', ')}`);
  }
  const unclassifiedFiles = discoveredFiles
    .filter(testFile => !classifiedSet.has(testFile) && !excludedSet.has(testFile));
  if (unclassifiedFiles.length > 0) {
    throw new Error(`unclassified test files: ${unclassifiedFiles.join(', ')}`);
  }

  // A quarantined file stays classified in its suite; CI runs it in a separate
  // non-blocking job until its issue is fixed (docs/architecture/phase0-test-discovery.md).
  const quarantine = registry.quarantine ?? [];
  if (!Array.isArray(quarantine)) throw new Error('test registry quarantine must be an array');
  const quarantinedFiles = [];
  for (const entry of quarantine) {
    if (!isRecord(entry)) throw new Error('each quarantine entry must be an object');
    validateTestPath(entry.file);
    if (!classifiedSet.has(entry.file)) throw new Error(`quarantined test is not classified: ${entry.file}`);
    if (typeof entry.issue !== 'string' || !ISSUE_URL_PATTERN.test(entry.issue)) {
      throw new Error(`quarantine issue must be a GitHub issue URL: ${entry.file}`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      throw new Error(`quarantine reason is required: ${entry.file}`);
    }
    quarantinedFiles.push(entry.file);
  }
  const duplicateQuarantine = [...countFiles(quarantinedFiles)]
    .filter(([, count]) => count > 1)
    .map(([testFile]) => testFile)
    .sort();
  if (duplicateQuarantine.length > 0) {
    throw new Error(`quarantined more than once: ${duplicateQuarantine.join(', ')}`);
  }

  for (const [testFile, environment] of Object.entries(registry.fileEnvironment)) {
    validateTestPath(testFile);
    if (!classifiedSet.has(testFile)) {
      throw new Error(`fileEnvironment target is not classified: ${testFile}`);
    }
    validateEnvironment(environment, `fileEnvironment for ${testFile}`);
  }

  return {
    counts: countsBySuite,
    discovered: discoveredFiles.length,
    excluded: excludedFiles.length,
    files: classifiedFiles,
    quarantined: quarantinedFiles,
  };
}

function commandForTest(testFile) {
  if (testFile.endsWith('.sh')) return { command: 'bash', args: [testFile] };
  if (/\.(?:js|mjs|cjs)$/.test(testFile)) {
    return { command: process.execPath, args: [testFile] };
  }
  return { command: process.execPath, args: ['--import', 'tsx', testFile] };
}

function terminateChild(child, signal) {
  if (process.platform !== 'win32' && Number.isInteger(child.pid)) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  }
  child.kill?.(signal);
}

function runChild(
  testFile,
  repositoryRoot,
  environment,
  spawnImpl, signalEmitter, killImpl,
) {
  const { command, args } = commandForTest(testFile);
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      cwd: repositoryRoot,
      detached: process.platform !== 'win32',
      env: environment,
      shell: false,
      stdio: 'inherit',
    });
    let settled = false;
    let forwardedSignal = null;
    let forceKillTimer = null;
    let forceKillSent = false;
    const cleanup = () => {
      for (const signal of FORWARDED_SIGNALS) signalEmitter.removeListener(signal, signalHandlers[signal]);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    };
    const interruptError = signal => {
      const error = new Error(`${testFile} interrupted by ${signal}`);
      error.signal = signal;
      error.testFile = testFile;
      error.interrupted = true;
      return error;
    };
    const forceKill = () => {
      if (forceKillSent) return;
      forceKillSent = true;
      try {
        killImpl(child, 'SIGKILL');
      } catch {
        // The original interruption remains the result even if the group exited first.
      }
    };
    const forwardSignal = signal => {
      if (settled) return;
      if (forwardedSignal) {
        forceKill();
        return;
      }
      forwardedSignal = signal;
      try {
        killImpl(child, signal);
        forceKillTimer = setTimeout(forceKill, FORCE_KILL_DELAY_MS);
        forceKillTimer.unref?.();
      } catch (error) {
        settled = true;
        cleanup();
        const interrupted = interruptError(signal);
        interrupted.cause = error;
        reject(interrupted);
      }
    };
    const signalHandlers = Object.fromEntries(
      FORWARDED_SIGNALS.map(signal => [signal, () => forwardSignal(signal)]),
    );
    for (const signal of FORWARDED_SIGNALS) signalEmitter.on(signal, signalHandlers[signal]);

    const rejectInterrupted = () => {
      if (!forwardedSignal) return false;
      forceKill();
      cleanup();
      reject(interruptError(forwardedSignal));
      return true;
    };

    child.once('error', error => {
      if (settled) return;
      settled = true;
      if (rejectInterrupted()) return;
      cleanup();
      error.testFile = testFile;
      reject(error);
    });
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      if (rejectInterrupted()) return;
      cleanup();
      if (signal) {
        const error = new Error(`${testFile} terminated by ${signal}`);
        error.signal = signal;
        error.testFile = testFile;
        reject(error);
        return;
      }
      if (exitCode !== 0) {
        const error = new Error(`${testFile} exited with code ${exitCode}`);
        error.exitCode = exitCode;
        error.testFile = testFile;
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/**
 * Parses a `--shard` value such as `2/6` into a 1-based shard index and total.
 */
export function parseShard(value) {
  const match = /^([1-9][0-9]*)\/([1-9][0-9]*)$/.exec(String(value));
  const index = match ? Number(match[1]) : 0;
  const total = match ? Number(match[2]) : 0;
  if (!match || index > total) throw new Error(`invalid shard: ${String(value)} (expected <index>/<total>, 1 <= index <= total)`);
  return { index, total };
}

export function validateTestDurations(durations) {
  if (!isRecord(durations) || durations.version !== 1) throw new Error('test durations version must be 1');
  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (!positive(durations.defaultSeconds)) throw new Error('test durations defaultSeconds must be a positive number');
  if (!isRecord(durations.seconds)) throw new Error('test durations seconds must be an object');
  for (const [testFile, seconds] of Object.entries(durations.seconds)) {
    validateTestPath(testFile);
    if (!positive(seconds)) throw new Error(`test duration for ${testFile} must be a positive number`);
  }
  return durations;
}

/**
 * Splits `items` into `total` disjoint shards whose summed historical durations
 * are as even as a greedy longest-first assignment gets. Every item lands in
 * exactly one shard, each shard keeps the input order, and the result depends
 * only on the inputs, so every CI shard computes the same partition on its own.
 * Files without a recorded duration weigh `defaultSeconds`.
 */
export function planShards(items, total, durations, fileOf = item => item) {
  if (!Number.isInteger(total) || total < 1) throw new Error(`invalid shard total: ${String(total)}`);
  const weightOf = item => durations?.seconds?.[fileOf(item)] ?? durations?.defaultSeconds ?? 1;
  const loads = Array.from({ length: total }, () => 0);
  const assignment = new Map();
  const longestFirst = items
    .map((item, position) => ({ item, position, weight: weightOf(item) }))
    .sort((left, right) => right.weight - left.weight || left.position - right.position);
  for (const { position, weight } of longestFirst) {
    let lightest = 0;
    for (let shard = 1; shard < total; shard += 1) if (loads[shard] < loads[lightest]) lightest = shard;
    loads[lightest] += weight;
    assignment.set(position, lightest);
  }
  const shards = Array.from({ length: total }, () => []);
  items.forEach((item, position) => shards[assignment.get(position)].push(item));
  return shards;
}

/**
 * Reads the list given to `--only-files`: either the JSON printed by
 * `scripts/ci-affected-tests.mjs` (its `files` map, or a bare `{ suite: [...] }`
 * map, or an array of paths) or plain text with one path per line. Returns the
 * set of allowed test paths; suites are not distinguished because a file
 * belongs to exactly one suite. Paths are normalised to the registry's form
 * (POSIX, relative to the repository root): `./tests/a.test.ts`,
 * `tests\\a.test.ts` and `<repositoryRoot>/tests/a.test.ts` all mean
 * `tests/a.test.ts`.
 */
export function parseOnlyFiles(text, repositoryRoot = null) {
  const normalize = entry => {
    let normalized = path.posix.normalize(entry.trim().replaceAll('\\', '/'));
    if (repositoryRoot !== null) {
      const root = repositoryRoot.split(path.sep).join('/').replace(/\/$/, '');
      if (normalized.startsWith(`${root}/`)) normalized = normalized.slice(root.length + 1);
    }
    return normalized;
  };
  const trimmed = String(text).trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`--only-files is not valid JSON: ${error.message}`);
    }
    const list = Array.isArray(parsed)
      ? parsed
      : Object.values(isRecord(parsed.files) ? parsed.files : parsed).flat();
    if (!list.every(entry => typeof entry === 'string')) {
      throw new Error('--only-files must list test paths as strings');
    }
    return new Set(list.map(normalize));
  }
  return new Set(trimmed.split('\n').map(line => line.trim()).filter(Boolean).map(normalize));
}

function formatSeconds(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

const SUMMARY_ICONS = { PASS: '✅', FLAKY: '⚠️', FAIL: '❌', 'NOT RUN': '⏭️' };

function writeStepSummary(summaryPath, { title, results, executed, selected, flaky, failed }) {
  if (!summaryPath) return;
  const lines = [
    `### ${title}`,
    '',
    `Executed ${executed} of ${selected} selected files; flaky: ${flaky.length}.`,
    '',
    // The plan's exit criterion counts a retry-pass as a failure, so the report
    // does too, although only a FAIL fails the job.
    `Reported failures: ${failed + flaky.length} (FAIL ${failed} + FLAKY ${flaky.length}; a retry-pass counts as a failure in this report but does not fail the job).`,
    ...(flaky.length > 0
      ? ['', `**FLAKY** (failed once, passed on the single retry): ${flaky.map(file => `\`${file}\``).join(', ')}`]
      : []),
    '',
    '| Result | File | Duration |',
    '| --- | --- | --- |',
    ...results.map(({ status, testFile, milliseconds, note }) =>
      `| ${SUMMARY_ICONS[status]} ${status} | \`${testFile}\` | ${milliseconds === null ? '-' : formatSeconds(milliseconds)}${note ? ` (${note.replaceAll('|', '\\|')})` : ''} |`),
    '',
  ];
  appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

// A nonzero exit or a crash of the test process itself may be a flake; an
// interruption of the runner or a failure to start the process is not.
function isRetryable(error) {
  return !error.interrupted && (Number.isInteger(error.exitCode) || typeof error.signal === 'string');
}

/**
 * Runs the selected registry suites sequentially, one child process per file.
 *
 * `shard` restricts the run to one deterministic slice of the selected files
 * (see `planShards`). `retryFailedOnce` reruns a failing file exactly once:
 * a pass on the retry is reported as FLAKY in the log, as a GitHub warning
 * annotation and in the step summary; a second failure fails the run.
 * `continueOnFailure` runs the remaining files after a failure and then fails
 * with every failing file named, so one CI run reports all of them.
 * `quarantine` (`'exclude'` or `'only'`) drops or keeps just the registry's
 * quarantined files before sharding; `null` runs every selected file.
 * `onlyFiles` (a set of test paths) keeps just those files of the selected
 * suites, before the quarantine filter and before sharding; `null` keeps all.
 * Nothing left to run is a success that says so.
 */
export async function runTestRegistry(registry, options) {
  const {
    repositoryRoot,
    parentEnv = process.env,
    spawnImpl = spawn,
    signalEmitter = process,
    killImpl = terminateChild,
    logger = message => console.log(message),
    suiteIds = TEST_SUITE_IDS,
    shard = null,
    durations = null,
    retryFailedOnce = false,
    continueOnFailure = false,
    quarantine = null,
    onlyFiles = null,
    summaryPath = null,
    annotations = false,
    clock = () => performance.now(),
  } = options;
  const validated = validateTestRegistry(registry, { repositoryRoot });
  const selectedSuites = new Set(suiteIds);
  const unknownSuiteIds = [...selectedSuites].filter(id => !TEST_SUITE_IDS.includes(id));
  if (unknownSuiteIds.length > 0) throw new Error(`unknown suite: ${unknownSuiteIds.join(', ')}`);
  if (quarantine !== null && !QUARANTINE_MODES.includes(quarantine)) throw new Error(`unknown quarantine mode: ${quarantine}`);

  const quarantinedSet = new Set(validated.quarantined);
  const inSelectedSuites = registry.suites
    .filter(suite => selectedSuites.has(suite.id))
    .flatMap(suite => suite.files.map(testFile => ({ suiteId: suite.id, testFile })));
  const requested = onlyFiles === null
    ? inSelectedSuites
    : inSelectedSuites.filter(({ testFile }) => onlyFiles.has(testFile));
  if (onlyFiles !== null) {
    logger(`[test-suite] ONLY-FILES selected ${requested.length} of ${inSelectedSuites.length} files in the suites`);
  }
  const selected = requested
    .filter(({ testFile }) => quarantine === null || quarantinedSet.has(testFile) === (quarantine === 'only'));
  if (quarantine) {
    logger(`[test-suite] QUARANTINE ${quarantine} files=${selected.length} quarantined=${quarantinedSet.size}`);
  }
  if (onlyFiles !== null && selected.length === 0) {
    logger('[test-suite] ONLY-FILES selected 0 files; nothing to run');
  }
  const planned = shard
    ? planShards(selected, shard.total, durations, item => item.testFile)[shard.index - 1]
    : selected;
  const shardLabel = shard ? ` shard=${shard.index}/${shard.total}` : '';
  if (shard) {
    logger(`[test-suite] SHARD ${shard.index}/${shard.total} files=${planned.length} of selected=${selected.length}`);
  }

  const results = planned.map(({ testFile }) => ({ status: 'NOT RUN', testFile, milliseconds: null, note: '' }));
  const flaky = [];
  const failures = [];
  let executed = 0;
  const finish = () => writeStepSummary(summaryPath, {
    title: `Test suites: ${[...selectedSuites].join(', ')}${shard ? ` · shard ${shard.index}/${shard.total}` : ''}${
      quarantine === 'only' ? ' · quarantine (non-blocking)' : ''}`,
    results,
    executed,
    selected: planned.length,
    flaky,
    failed: failures.length,
  });
  const stop = error => {
    logger(`[test-suite] SUMMARY executed=${executed} registered=${validated.files.length}${shardLabel}${
      failures.length > 1 ? ` failed=${failures.length}` : ''}`);
    finish();
    if (failures.length > 1 && !error.interrupted) {
      error.message = `${failures.length} test files failed: ${failures.map(({ testFile }) => testFile).join(', ')}`;
    }
    throw error;
  };
  for (const [position, { suiteId, testFile }] of planned.entries()) {
    executed += 1;
    logger(`[test-suite] START ${suiteId} ${testFile}`);
    const environment = {
      ...parentEnv,
      ...(registry.fileEnvironment[testFile] ?? {}),
    };
    const startedAt = clock();
    const attempt = () => runChild(testFile, repositoryRoot, environment, spawnImpl, signalEmitter, killImpl);
    let firstError = null;
    let finalError = null;
    try {
      await attempt();
    } catch (error) {
      firstError = error;
    }
    if (firstError && retryFailedOnce && isRetryable(firstError)) {
      logger(`[test-suite] RETRY ${suiteId} ${testFile} after: ${firstError.message}`);
      try {
        await attempt();
      } catch (retryError) {
        finalError = retryError;
      }
    } else {
      finalError = firstError;
    }
    const milliseconds = clock() - startedAt;
    if (finalError) {
      results[position] = { status: 'FAIL', testFile, milliseconds, note: finalError.message };
      failures.push({ testFile, error: finalError });
      logger(`[test-suite] FAIL ${suiteId} ${testFile}`);
      if (annotations) logger(`::error title=Test failed::${testFile}: ${finalError.message}`);
      // An interrupted runner never continues, so a cancelled job stops promptly.
      if (finalError.interrupted) stop(finalError);
      if (!continueOnFailure) stop(failures[0].error);
    } else if (firstError) {
      flaky.push(testFile);
      results[position] = { status: 'FLAKY', testFile, milliseconds, note: `first attempt: ${firstError.message}` };
      logger(`[test-suite] FLAKY ${suiteId} ${testFile}`);
      if (annotations) logger(`::warning title=FLAKY test::${testFile} failed once (${firstError.message}) and passed on the single retry`);
    } else {
      results[position] = { status: 'PASS', testFile, milliseconds, note: '' };
      logger(`[test-suite] PASS ${suiteId} ${testFile}`);
    }
  }
  if (failures.length > 0) stop(failures[0].error);
  const summary = {
    executed,
    registered: validated.files.length,
    excluded: validated.excluded,
  };
  if (shard) summary.shard = `${shard.index}/${shard.total}`;
  if (retryFailedOnce) summary.flaky = flaky;
  logger(`[test-suite] SUMMARY executed=${executed} registered=${validated.files.length} excluded=${validated.excluded}${
    shardLabel}${retryFailedOnce ? ` flaky=${flaky.length} reported-failures=${flaky.length}` : ''}`);
  finish();
  return summary;
}

export function loadTestRegistry(registryPath) {
  return JSON.parse(readFileSync(registryPath, 'utf8'));
}

function printValidationSummary(validated) {
  const categories = TEST_SUITE_IDS
    .map(id => `${id}=${validated.counts[id]}`)
    .join(' ');
  console.log(
    `test discovery valid: discovered=${validated.discovered} registered=${validated.files.length} excluded=${validated.excluded} ${categories} quarantined=${validated.quarantined.length}`,
  );
}

const USAGE = 'usage: node scripts/test-suite-runner.mjs <--validate|--all|--suite <id>[,<id>...]> [--shard <index>/<total>] [--retry-failed-once] [--continue-on-failure] [--quarantine <exclude|only>] [--only-files <file>]';

/** Parses runner arguments; exported for the CLI contract tests. */
export function parseRunnerArguments(args) {
  if (args.length === 1 && args[0] === '--validate') return { validate: true };
  const [mode, ...rest] = args;
  let suiteIds;
  if (mode === '--all') {
    suiteIds = [...TEST_SUITE_IDS];
  } else if (mode === '--suite' && rest.length > 0 && !rest[0].startsWith('--')) {
    suiteIds = rest.shift().split(',');
  } else {
    throw new Error(USAGE);
  }
  const options = {
    validate: false, suiteIds, shard: null, retryFailedOnce: false, continueOnFailure: false, quarantine: null,
  };
  while (rest.length > 0) {
    const flag = rest.shift();
    if (flag === '--shard' && rest.length > 0 && !options.shard) {
      options.shard = parseShard(rest.shift());
    } else if (flag === '--retry-failed-once' && !options.retryFailedOnce) {
      options.retryFailedOnce = true;
    } else if (flag === '--continue-on-failure' && !options.continueOnFailure) {
      options.continueOnFailure = true;
    } else if (flag === '--quarantine' && QUARANTINE_MODES.includes(rest[0]) && !options.quarantine) {
      options.quarantine = rest.shift();
    } else if (flag === '--only-files' && rest.length > 0 && !rest[0].startsWith('--') && options.onlyFilesPath === undefined) {
      options.onlyFilesPath = rest.shift();
    } else {
      throw new Error(USAGE);
    }
  }
  return options;
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const registryPath = path.join(repositoryRoot, 'tests', 'test-suites.json');
  const registry = loadTestRegistry(registryPath);
  const options = parseRunnerArguments(process.argv.slice(2));

  if (options.validate) {
    printValidationSummary(validateTestRegistry(registry, { repositoryRoot }));
    return;
  }
  await runTestRegistry(registry, {
    repositoryRoot,
    suiteIds: options.suiteIds,
    shard: options.shard,
    durations: options.shard
      ? validateTestDurations(loadTestRegistry(path.join(repositoryRoot, 'tests', 'test-durations.json')))
      : null,
    retryFailedOnce: options.retryFailedOnce,
    continueOnFailure: options.continueOnFailure,
    quarantine: options.quarantine,
    onlyFiles: options.onlyFilesPath ? parseOnlyFiles(readFileSync(options.onlyFilesPath, 'utf8'), repositoryRoot) : null,
    summaryPath: process.env.GITHUB_STEP_SUMMARY || null,
    annotations: process.env.GITHUB_ACTIONS === 'true',
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error.message);
    const signalNumber = typeof error.signal === 'string' ? osConstants.signals[error.signal] : undefined;
    process.exitCode = Number.isInteger(error.exitCode) && error.exitCode > 0
      ? error.exitCode
      : signalNumber
        ? 128 + signalNumber
        : 1;
  });
}
