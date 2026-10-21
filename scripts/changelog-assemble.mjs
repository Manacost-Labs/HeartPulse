#!/usr/bin/env node
/**
 * Changelog fragments: every change adds its own `changelog.d/<date>-<slug>.md`
 * instead of editing the top of CHANGELOG.md, so parallel branches never
 * conflict there. This script folds the fragments into CHANGELOG.md: into
 * `## Unreleased` on demand, or into a new version section at release time.
 */
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FRAGMENT_DIR = 'changelog.d';
export const FRAGMENT_NAME = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const UNRELEASED = '## Unreleased';
const VERSION = /^v\d+\.\d+\.\d+$/;

/** Files that are not fragments: the folder's own README. */
function isFragmentCandidate(file) {
  return file.endsWith('.md') && file !== 'README.md';
}

export function validateFragment(file, text) {
  const errors = [];
  const match = FRAGMENT_NAME.exec(file);
  if (!match) errors.push(`${file}: name must be YYYY-MM-DD-<lowercase-slug>.md`);
  else if (Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`))) errors.push(`${file}: invalid date`);
  const body = text.trim();
  if (!body) errors.push(`${file}: empty fragment`);
  if (/^#/m.test(body)) errors.push(`${file}: headings belong to CHANGELOG.md, write plain text`);
  if (/^[-*] /.test(body)) errors.push(`${file}: write the entry text without the leading list marker`);
  return errors;
}

export function readFragments(root = PROJECT_ROOT) {
  const dir = join(root, FRAGMENT_DIR);
  if (!existsSync(dir)) return { fragments: [], errors: [] };
  const fragments = [];
  const errors = [];
  for (const file of readdirSync(dir).filter(isFragmentCandidate).sort()) {
    const text = readFileSync(join(dir, file), 'utf8');
    const problems = validateFragment(file, text);
    errors.push(...problems);
    if (!problems.length) fragments.push({ file: `${FRAGMENT_DIR}/${file}`, text: text.trim() });
  }
  return { fragments, errors };
}

/** One fragment as a CHANGELOG list item: `- ` first line, two-space continuation. */
export function formatEntry(text) {
  return text.trim().split('\n').map((line, index) => {
    if (index === 0) return `- ${line}`;
    return line.trim() ? `  ${line}` : '';
  }).join('\n');
}

function splitChangelog(changelog) {
  const start = changelog.indexOf(`${UNRELEASED}\n`);
  if (start === -1) throw new Error(`CHANGELOG.md has no "${UNRELEASED}" section`);
  const bodyStart = start + UNRELEASED.length + 1;
  const next = changelog.slice(bodyStart).search(/^## /m);
  const bodyEnd = next === -1 ? changelog.length : bodyStart + next;
  return {
    head: changelog.slice(0, start),
    unreleased: changelog.slice(bodyStart, bodyEnd).trim(),
    rest: changelog.slice(bodyEnd),
  };
}

/**
 * Returns the new CHANGELOG.md text. Fragments go first, newest first, above
 * entries already under `Unreleased`. With `version` the combined entries
 * become `## <version> — <date>` and `Unreleased` stays empty.
 */
export function assembleChangelog(changelog, fragments, { version, date } = {}) {
  if (version && !VERSION.test(version)) throw new Error(`version must look like v1.2.3, got ${version}`);
  const { head, unreleased, rest } = splitChangelog(changelog);
  if (version && rest.includes(`## ${version} `)) throw new Error(`CHANGELOG.md already has ${version}`);
  const entries = [...fragments].reverse().map(fragment => formatEntry(fragment.text));
  const body = [...entries, unreleased].filter(Boolean).join('\n\n');
  const tail = rest.trimStart() ? `\n${rest.trimStart()}` : '';
  if (!version) return `${head}${UNRELEASED}\n\n${body}${body ? '\n' : ''}${tail}`;
  if (!body) throw new Error('nothing to release: no fragments and an empty Unreleased section');
  return `${head}${UNRELEASED}\n\n## ${version} — ${date}\n\n${body}\n${tail}`;
}

/** The current public version: the first `## v…` heading after Unreleased. */
export function currentVersion(changelog) {
  return /^## (v\d+\.\d+\.\d+)\b/m.exec(changelog)?.[1] ?? null;
}

function parseArgs(argv) {
  const args = { check: false, version: null, date: new Date().toISOString().slice(0, 10) };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') args.check = true;
    else if (arg === '--release') args.version = argv[++index];
    else if (arg === '--date') args.date = argv[++index];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log([
      'Usage: npm run changelog:assemble -- [--check] [--release v1.2.3 [--date YYYY-MM-DD]]',
      '  --check             validate changelog.d/ fragments, change nothing',
      '  (no flags)          move fragments into "## Unreleased" of CHANGELOG.md',
      '  --release v1.2.3    move fragments and Unreleased entries into a new version section',
    ].join('\n'));
    return;
  }
  const { fragments, errors } = readFragments();
  if (errors.length) throw new Error(`invalid changelog fragments:\n${errors.join('\n')}`);
  if (args.check) {
    console.log(`changelog.d: ${fragments.length} valid fragment(s)`);
    return;
  }
  const changelogPath = join(PROJECT_ROOT, 'CHANGELOG.md');
  const next = assembleChangelog(readFileSync(changelogPath, 'utf8'), fragments, args);
  writeFileSync(changelogPath, next);
  for (const fragment of fragments) unlinkSync(join(PROJECT_ROOT, fragment.file));
  console.log(`CHANGELOG.md: ${fragments.length} fragment(s) ${args.version ? `released as ${args.version}` : 'moved into Unreleased'}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
