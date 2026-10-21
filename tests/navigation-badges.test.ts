import assert from 'node:assert/strict';
import test from 'node:test';
import { patchNotesBadge, PATCH_BADGE_DAYS } from '../src/app/shell/patchNotesBadge.js';
import { latestPatch } from '../src/app/shell/patchNotesArchive.js';
import { COMPACT_NAVIGATION_ATTRIBUTE, COMPACT_NAVIGATION_KEY, COMPACT_NAVIGATION_SCRIPT } from '../src/app/shell/navigationPreference.js';

const summary = (version: string, publishedAt: string | null) => ({
  version, build: `${version}.1`, title: version, publishedAt, sourceUrl: null, officialUrl: null, changeCount: 1,
});
const DAY = 24 * 60 * 60 * 1000;
const published = Date.parse('2026-10-12T16:55:00Z');

test('the newest dated patch is the menu patch, whatever the archive order', () => {
  const latest = latestPatch([summary('36.6.3', '2026-09-30T10:00:00Z'), summary('37.0.0', '2026-10-12T16:55:00Z'), summary('36.6.0', null)], 5);
  assert.deepEqual(latest, { version: '37.0.0', publishedAt: '2026-10-12T16:55:00Z', checkedAt: 5 });
  assert.equal(latestPatch([summary('1.0.0', null), summary('1.0.1', 'not a date')], 5), null);
});

test('«Новый» only for a recent patch the reader has not opened', () => {
  const latest = { version: '37.0.0', publishedAt: '2026-10-12T16:55:00Z', checkedAt: published };
  assert.deepEqual(patchNotesBadge(latest, null, published + DAY), { 'patch-notes': { label: 'Новый', title: 'Новый патч 37.0.0' } });
  assert.deepEqual(patchNotesBadge(latest, '36.6.3', published + DAY)['patch-notes']?.label, 'Новый');
  assert.deepEqual(patchNotesBadge(latest, '37.0.0', published + DAY), {}, 'seen patches lose the badge');
  assert.deepEqual(patchNotesBadge(latest, null, published + (PATCH_BADGE_DAYS + 1) * DAY), {}, 'old patches are not new');
  assert.deepEqual(patchNotesBadge(latest, null, published - DAY), {}, 'a clock behind the publication shows nothing');
  assert.deepEqual(patchNotesBadge(null, null, published), {}, 'no badge while the archive is unknown');
});

test('the head script applies only the remembered compact choice and never throws', () => {
  const run = (stored: string | null, throws = false) => {
    const attributes = new Set<string>();
    const localStorage = { getItem: (key: string) => { if (throws) throw new Error('blocked'); return key === COMPACT_NAVIGATION_KEY ? stored : null; } };
    const document = { documentElement: { setAttribute: (name: string) => attributes.add(name) } };
    new Function('localStorage', 'document', COMPACT_NAVIGATION_SCRIPT)(localStorage, document);
    return attributes.has(COMPACT_NAVIGATION_ATTRIBUTE);
  };
  assert.equal(run('1'), true);
  assert.equal(run(null), false);
  assert.equal(run('0'), false);
  assert.equal(run('1', true), false);
});
