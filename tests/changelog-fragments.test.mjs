import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assembleChangelog, currentVersion, formatEntry, readFragments, validateFragment,
} from '../scripts/changelog-assemble.mjs';

const CHANGELOG = [
  '# HearthPulse Changelog',
  '',
  '## Unreleased',
  '',
  '- Older unreleased entry.',
  '',
  '## v1.0.107 — 2026-10-13',
  '',
  '- Released entry.',
  '',
].join('\n');

const fragments = [
  { file: 'changelog.d/2026-10-20-meta.md', text: 'Мета быстрее.' },
  { file: 'changelog.d/2026-10-21-queue.md', text: 'Merge queue вместо пуша в main:\nагенты открывают PR.' },
];

test('the committed changelog fragments are valid', () => {
  assert.deepEqual(readFragments().errors, []);
});

test('fragment names and bodies are validated', () => {
  assert.deepEqual(validateFragment('2026-10-21-merge-queue.md', 'Текст.'), []);
  assert.match(validateFragment('merge-queue.md', 'Текст.')[0], /YYYY-MM-DD/);
  assert.match(validateFragment('2026-10-21-Queue.md', 'Текст.')[0], /lowercase-slug/);
  assert.match(validateFragment('2026-10-21-a.md', '   ')[0], /empty/);
  assert.match(validateFragment('2026-10-21-a.md', '## v1.0.0')[0], /headings/);
  assert.match(validateFragment('2026-10-21-a.md', '- Текст.')[0], /list marker/);
});

test('a fragment becomes one list item with indented continuation lines', () => {
  assert.equal(formatEntry('Первая строка\nвторая\n\nновый абзац\n'), '- Первая строка\n  вторая\n\n  новый абзац');
});

test('on demand, fragments go newest first above existing Unreleased entries', () => {
  const result = assembleChangelog(CHANGELOG, fragments);
  assert.equal(result, [
    '# HearthPulse Changelog',
    '',
    '## Unreleased',
    '',
    '- Merge queue вместо пуша в main:\n  агенты открывают PR.',
    '',
    '- Мета быстрее.',
    '',
    '- Older unreleased entry.',
    '',
    '## v1.0.107 — 2026-10-13',
    '',
    '- Released entry.',
    '',
  ].join('\n'));
  assert.equal(currentVersion(result), 'v1.0.107');
});

test('a release moves fragments and Unreleased entries into a new version section', () => {
  const result = assembleChangelog(CHANGELOG, fragments, { version: 'v1.0.108', date: '2026-10-21' });
  assert.match(result, /## Unreleased\n\n## v1\.0\.108 — 2026-10-21\n\n- Merge queue[\s\S]*- Older unreleased entry\.\n\n## v1\.0\.107/);
  assert.equal(currentVersion(result), 'v1.0.108');
  assert.throws(() => assembleChangelog(result, [], { version: 'v1.0.108', date: '2026-10-21' }), /nothing to release|already has/);
  assert.throws(() => assembleChangelog(CHANGELOG, fragments, { version: '1.0.108' }), /v1\.2\.3/);
});

test('fragments are read in file-name order and the README is skipped', () => {
  const root = mkdtempSync(join(tmpdir(), 'changelog-fragments-'));
  mkdirSync(join(root, 'changelog.d'));
  writeFileSync(join(root, 'changelog.d/README.md'), '# How to write a fragment\n');
  writeFileSync(join(root, 'changelog.d/2026-10-21-b.md'), 'B\n');
  writeFileSync(join(root, 'changelog.d/2026-10-20-a.md'), 'A\n');
  const { fragments: found, errors } = readFragments(root);
  assert.deepEqual(errors, []);
  assert.deepEqual(found.map(fragment => fragment.file), ['changelog.d/2026-10-20-a.md', 'changelog.d/2026-10-21-b.md']);
});

test('the Telegram post reads the change fragment and the current version', () => {
  const source = readFileSync('scripts/post-arena-changelog.mjs', 'utf8');
  assert.match(source, /--fragment/);
  assert.match(source, /currentVersion\(/);
});
