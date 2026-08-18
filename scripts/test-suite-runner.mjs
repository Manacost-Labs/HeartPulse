import { spawn } from 'node:child_process';
import {
  readFileSync,
  readdirSync,
} from 'node:fs';
import { constants as osConstants } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEST_FILE_PATTERN = /\.test\.(?:ts|tsx|mjs)$/;
const TEST_DISCOVERY_IGNORED_ROOTS = new Set([
  '.codegraph',
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'storybook-static',
  'test-results',
]);
const ENVIRONMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SUITE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM'];
const FORCE_KILL_DELAY_MS = 5_000;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectTestFiles(directory, repositoryRoot, files) {
  const isRepositoryRoot = path.resolve(directory) === path.resolve(repositoryRoot);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (isRepositoryRoot && TEST_DISCOVERY_IGNORED_ROOTS.has(entry.name)) continue;
      collectTestFiles(absolutePath, repositoryRoot, files);
      continue;
    }
    if (!entry.isFile() || !TEST_FILE_PATTERN.test(entry.name)) continue;
    files.push(path.relative(repositoryRoot, absolutePath).split(path.sep).join('/'));
  }
}

export function discoverTestFiles(repositoryRoot) {
  const files = [];
  collectTestFiles(repositoryRoot, repositoryRoot, files);
  return files.sort();
}

function validateEnvironment(environment) {
  if (!isRecord(environment)) {
    throw new Error('test registry env must be an object');
  }
  for (const [name, value] of Object.entries(environment)) {
    if (!ENVIRONMENT_NAME_PATTERN.test(name)) {
      throw new Error(`invalid environment variable name: ${name}`);
    }
    if (typeof value !== 'string') {
      throw new Error(`environment variable ${name} must be a string`);
    }
  }
}

function validateTestPath(testFile) {
  const normalizedPath = typeof testFile === 'string'
    ? path.posix.normalize(testFile)
    : '';
  const safe = typeof testFile === 'string'
    && testFile.length > 0
    && !testFile.includes('\0')
    && !testFile.includes('\\')
    && !path.posix.isAbsolute(testFile)
    && normalizedPath === testFile
    && testFile.startsWith('tests/')
    && TEST_FILE_PATTERN.test(testFile);
  if (!safe) throw new Error(`unsafe test path: ${String(testFile)}`);
}

export function validateTestRegistry(registry, { repositoryRoot }) {
  if (!isRecord(registry)) throw new Error('test registry must be an object');
  if (registry.version !== 1) throw new Error('test registry version must be 1');
  if (!Array.isArray(registry.suites) || registry.suites.length === 0) {
    throw new Error('test registry suites must be a non-empty array');
  }

  const suiteIds = new Set();
  const files = [];
  for (const suite of registry.suites) {
    if (!isRecord(suite) || typeof suite.id !== 'string' || !SUITE_ID_PATTERN.test(suite.id)) {
      throw new Error('each test suite must have a kebab-case id');
    }
    if (suiteIds.has(suite.id)) {
      throw new Error(`duplicate test suite id: ${suite.id}`);
    }
    suiteIds.add(suite.id);
    validateEnvironment(suite.env);
    if (!Array.isArray(suite.files) || suite.files.length === 0) {
      throw new Error(`test suite ${suite.id} must contain at least one file`);
    }
    for (const testFile of suite.files) {
      validateTestPath(testFile);
      files.push(testFile);
    }
  }

  const counts = new Map();
  for (const testFile of files) {
    counts.set(testFile, (counts.get(testFile) || 0) + 1);
  }
  const duplicateFiles = [...counts]
    .filter(([, count]) => count > 1)
    .map(([testFile]) => testFile)
    .sort();
  if (duplicateFiles.length > 0) {
    throw new Error(`registered more than once: ${duplicateFiles.join(', ')}`);
  }

  const discoveredFiles = discoverTestFiles(repositoryRoot);
  const misplacedFiles = discoveredFiles.filter(testFile => !testFile.startsWith('tests/'));
  if (misplacedFiles.length > 0) {
    throw new Error(`test files must live under tests/: ${misplacedFiles.join(', ')}`);
  }
  const discoveredSet = new Set(discoveredFiles);
  const registeredSet = new Set(files);
  const nonexistentFiles = files.filter(testFile => !discoveredSet.has(testFile)).sort();
  if (nonexistentFiles.length > 0) {
    throw new Error(`registered test does not exist: ${nonexistentFiles.join(', ')}`);
  }
  const missingFiles = discoveredFiles.filter(testFile => !registeredSet.has(testFile));
  if (missingFiles.length > 0) {
    throw new Error(`missing from registry: ${missingFiles.join(', ')}`);
  }

  return { files };
}

function commandForTest(testFile) {
  return {
    command: process.execPath,
    args: ['--import', 'tsx', testFile],
  };
}

function killChildProcessGroup(child, signal) {
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
  { spawnImpl, signalEmitter, killImpl },
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

export async function runTestRegistry(registry, options) {
  const {
    repositoryRoot,
    parentEnv = process.env,
    spawnImpl = spawn,
    signalEmitter = process,
    killImpl = killChildProcessGroup,
    logger = message => console.log(message),
  } = options;
  const validated = validateTestRegistry(registry, { repositoryRoot });
  let executed = 0;

  for (const suite of registry.suites) {
    const environment = { ...parentEnv, ...suite.env };
    for (const testFile of suite.files) {
      executed += 1;
      logger(`[test-suite] START ${suite.id} ${testFile}`);
      try {
        await runChild(testFile, repositoryRoot, environment, {
          spawnImpl,
          signalEmitter,
          killImpl,
        });
        logger(`[test-suite] PASS ${suite.id} ${testFile}`);
      } catch (error) {
        logger(`[test-suite] FAIL ${suite.id} ${testFile}`);
        logger(`[test-suite] SUMMARY executed=${executed} registered=${validated.files.length}`);
        throw error;
      }
    }
  }
  const summary = { executed, registered: validated.files.length };
  logger(`[test-suite] SUMMARY executed=${summary.executed} registered=${summary.registered}`);
  return summary;
}

export function loadTestRegistry(registryPath) {
  return JSON.parse(readFileSync(registryPath, 'utf8'));
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const registryPath = path.join(repositoryRoot, 'tests', 'test-suites.json');
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--all', '--validate'].includes(args[0])) {
    throw new Error('usage: node scripts/test-suite-runner.mjs <--all|--validate>');
  }

  const registry = loadTestRegistry(registryPath);
  if (args[0] === '--validate') {
    const validated = validateTestRegistry(registry, { repositoryRoot });
    console.log(
      `test registry valid: ${registry.suites.length} suites, ${validated.files.length} files`,
    );
    return;
  }
  await runTestRegistry(registry, { repositoryRoot });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error.message);
    const signalNumber = typeof error.signal === 'string'
      ? osConstants.signals[error.signal]
      : undefined;
    process.exitCode = Number.isInteger(error.exitCode) && error.exitCode > 0
      ? error.exitCode
      : signalNumber
        ? 128 + signalNumber
        : 1;
  });
}
