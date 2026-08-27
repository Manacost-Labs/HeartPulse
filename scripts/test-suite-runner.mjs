import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
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

function runChild(testFile, repositoryRoot, environment, spawnImpl, signalEmitter, killImpl) {
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
    const signalHandlers = Object.fromEntries(FORWARDED_SIGNALS.map(signal => [
      signal,
      () => killImpl(child, signal),
    ]));
    const cleanup = () => {
      for (const signal of FORWARDED_SIGNALS) {
        signalEmitter.removeListener(signal, signalHandlers[signal]);
      }
    };
    for (const signal of FORWARDED_SIGNALS) signalEmitter.on(signal, signalHandlers[signal]);

    child.once('error', error => {
      if (settled) return;
      settled = true;
      cleanup();
      error.testFile = testFile;
      reject(error);
    });
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
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

export async function runTestRegistry(registry, options) {
  const {
    repositoryRoot,
    parentEnv = process.env,
    spawnImpl = spawn,
    signalEmitter = process,
    killImpl = terminateChild,
    logger = message => console.log(message),
    suiteIds = TEST_SUITE_IDS,
  } = options;
  const validated = validateTestRegistry(registry, { repositoryRoot });
  const selectedSuites = new Set(suiteIds);
  const unknownSuiteIds = [...selectedSuites].filter(id => !TEST_SUITE_IDS.includes(id));
  if (unknownSuiteIds.length > 0) throw new Error(`unknown suite: ${unknownSuiteIds.join(', ')}`);

  let executed = 0;
  for (const suite of registry.suites) {
    if (!selectedSuites.has(suite.id)) continue;
    for (const testFile of suite.files) {
      executed += 1;
      logger(`[test-suite] START ${suite.id} ${testFile}`);
      const environment = {
        ...parentEnv,
        ...(registry.fileEnvironment[testFile] ?? {}),
      };
      try {
        await runChild(testFile, repositoryRoot, environment, spawnImpl, signalEmitter, killImpl);
        logger(`[test-suite] PASS ${suite.id} ${testFile}`);
      } catch (error) {
        logger(`[test-suite] FAIL ${suite.id} ${testFile}`);
        logger(`[test-suite] SUMMARY executed=${executed} registered=${validated.files.length}`);
        throw error;
      }
    }
  }
  const summary = {
    executed,
    registered: validated.files.length,
    excluded: validated.excluded,
  };
  logger(`[test-suite] SUMMARY executed=${executed} registered=${validated.files.length} excluded=${validated.excluded}`);
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
    `test discovery valid: discovered=${validated.discovered} registered=${validated.files.length} excluded=${validated.excluded} ${categories}`,
  );
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const registryPath = path.join(repositoryRoot, 'tests', 'test-suites.json');
  const registry = loadTestRegistry(registryPath);
  const args = process.argv.slice(2);

  if (args.length === 1 && args[0] === '--validate') {
    printValidationSummary(validateTestRegistry(registry, { repositoryRoot }));
    return;
  }
  if (args.length === 1 && args[0] === '--all') {
    await runTestRegistry(registry, { repositoryRoot });
    return;
  }
  if (args.length === 2 && args[0] === '--suite') {
    await runTestRegistry(registry, { repositoryRoot, suiteIds: [args[1]] });
    return;
  }
  throw new Error('usage: node scripts/test-suite-runner.mjs <--validate|--all|--suite <id>>');
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
