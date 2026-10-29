#!/usr/bin/env node
/**
 * Prints which registered test files a change affects.
 *
 *   node scripts/ci-affected-tests.mjs --base <sha> --head <sha> [--output <file>]
 *   node scripts/ci-affected-tests.mjs --files-from <file> [--output <file>]
 *
 * The result is `{ mode: "all" | "subset" | "none", reason, files: { <suite>: [...] }, affectedModules }`
 * on stdout or in `--output`; feed it to `scripts/test-suite-runner.mjs --only-files`.
 * The selection rules live in `scripts/lib/ci-affected-tests.mjs`; this file
 * only reads the changed paths (git or a list) and the three configs.
 * Exit codes: 0 selection printed, 2 bad arguments, 1 any other error — a
 * caller must treat a non-zero exit as `all`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { selectAffectedTests } from './lib/ci-affected-tests.mjs';
import { singleLineErrorMessage } from './lib/diagnostic-text-policy.mjs';

const USAGE = 'usage: node scripts/ci-affected-tests.mjs (--base <sha> --head <sha> | --files-from <file>) [--output <file>] [--root <dir>]';
const REVISION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._/~^-]*$/;

export function parseAffectedArguments(args) {
  const options = { base: null, head: null, filesFrom: null, output: null, root: null };
  const flags = new Map([
    ['--base', 'base'], ['--head', 'head'], ['--files-from', 'filesFrom'],
    ['--output', 'output'], ['--root', 'root'],
  ]);
  const rest = [...args];
  while (rest.length > 0) {
    const key = flags.get(rest.shift());
    const value = rest.shift();
    if (!key || value === undefined || value.startsWith('--') || options[key] !== null) {
      throw new Error(USAGE);
    }
    options[key] = value;
  }
  const fromGit = options.base !== null && options.head !== null;
  const fromList = options.filesFrom !== null;
  if (fromGit === fromList || (!fromGit && (options.base !== null || options.head !== null))) {
    throw new Error(USAGE);
  }
  for (const revision of [options.base, options.head]) {
    if (revision !== null && !REVISION_PATTERN.test(revision)) throw new Error(USAGE);
  }
  return options;
}

/** Paths changed on `head` since it forked from `base` (renames reported as delete + add). */
export function changedFilesFromGit(root, base, head, run = execFileSync) {
  const output = run(
    'git',
    ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`, '--'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return output.split('\0').filter(Boolean);
}

export function changedFilesFromList(text) {
  return text.split('\n').map(line => line.trim()).filter(Boolean);
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

export function main(args = process.argv.slice(2), { stdout = process.stdout } = {}) {
  const options = parseAffectedArguments(args);
  const root = options.root
    ? path.resolve(options.root)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const changedFiles = options.filesFrom
    ? changedFilesFromList(readFileSync(options.filesFrom, 'utf8'))
    : changedFilesFromGit(root, options.base, options.head);
  const selection = selectAffectedTests({
    changedFiles,
    registry: readJson(root, 'tests/test-suites.json'),
    inventory: readJson(root, 'config/module-boundaries.json'),
    catalog: readJson(root, 'config/architecture-catalog.json'),
  });
  const json = `${JSON.stringify(selection, null, 2)}\n`;
  if (options.output) writeFileSync(options.output, json);
  else stdout.write(json);
  return selection;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[ci-affected-tests] ${singleLineErrorMessage(error)}\n`);
    process.exitCode = error.message === USAGE ? 2 : 1;
  }
}
