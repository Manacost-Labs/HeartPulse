import assert from 'node:assert/strict';
import express from 'express';
import fc from 'fast-check';
import {
  createAdminFunDecksRouter,
  createPublicFunDecksRouter,
  normalizeFunDecksPayload,
  normalizePublicFunDecksPayload,
} from '../server/adminFunDecksRoutes.js';
import { funDeckWhy } from '../server/funDeckWhy.js';
import { assertProperty } from './helpers/propertyRuns.js';

const normalized = normalizeFunDecksPayload({
  source_id: 'hsguru_fun_decks',
  fetched_at: '2026-07-25T01:15:16.225405+00:00',
  data: {
    structured: {
      detector_version: 'concept-v6',
      stats: { published_by_format: { standard: 1, wild: 1 } },
      filters: { max_meta_similarity: 0.42 },
      rows: [
        {
          title: 'Wild experiment',
          deck_code: 'W'.repeat(24),
          format: 'Wild',
          class: 'Warlock',
          fun_score: '0.71',
          reasons: ['card_package'],
        },
        {
          title: 'Standard experiment',
          deck_code: 'S'.repeat(24),
          format: 'Standard',
          class: 'Mage',
          fun_score: 0.82,
          win_rate: '53.4',
          games: '120',
        },
        {
          title: 'Streamer Mage',
          deck_code: 'AAECAf0ECP6eBO/8BsODB7OHB72nB6TZB5HbB//fBwvx0wSd1ATNngbTngbiiQfYngf5wweGxAeT2wf53geA4AcAAA==',
          format: 'Standard',
          class: null,
          record: '3 - 1',
          fun_score: 0.8,
        },
        {
          title: 'Broken row',
          deck_code: 'too-short',
          format: 'Standard',
        },
      ],
    },
  },
});

assert.equal(normalized.sourceId, 'hsguru_fun_decks');
assert.equal(normalized.detectorVersion, 'concept-v6');
assert.equal(normalized.decks.length, 3);
assert.equal(normalized.decks[0].title, 'Standard experiment');
assert.equal(normalized.decks[0].winRate, 53.4);
assert.equal(normalized.decks[0].games, 120);
const streamerDeck = normalized.decks.find(deck => deck.title === 'Streamer Mage');
assert.equal(streamerDeck?.className, 'Mage');
assert.equal(streamerDeck?.winRate, 75);
assert.equal(streamerDeck?.games, 4);
assert.deepEqual(normalized.decks.find(deck => deck.title === 'Wild experiment')?.reasons, ['card_package']);
assert.equal(normalized.cadence.timers.length, 2);

// concept-v7 adds the win rate interval, the absorbed variants and the source title; an older dataset has none of them.
const intervalRow = (title: string, extra: Record<string, unknown>) => (
  { title, deck_code: 'I'.repeat(24), format: 'Standard', games: 56, win_rate: 54, ...extra });
const withInterval = normalizeFunDecksPayload({ data: { structured: { rows: [
  intervalRow('With interval', { win_rate_ci_low: 40.7, win_rate_ci_high: 66.9, variants: 2, source_title: 'STD With interval' }),
  intervalRow('Older dataset', {}),
  intervalRow('Only a lower bound', { win_rate_ci_low: 40.7 }),
  intervalRow('Bounds reversed', { win_rate_ci_low: 70, win_rate_ci_high: 60 }),
  intervalRow('Bounds out of range', { win_rate_ci_low: -5, win_rate_ci_high: 140 }),
  intervalRow('Numbers as text', { win_rate_ci_low: '40.7', win_rate_ci_high: '66.9', variants: '3' }),
  intervalRow('Not a count', { variants: 1.5 }),
  intervalRow('Negative count', { variants: -1 }),
] } } }).decks;
const byTitle = (title: string) => withInterval.find(deck => deck.title === title);
assert.deepEqual(
  [byTitle('With interval')?.winRateCiLow, byTitle('With interval')?.winRateCiHigh, byTitle('With interval')?.variants, byTitle('With interval')?.sourceTitle],
  [40.7, 66.9, 2, 'STD With interval'],
);
assert.deepEqual(
  [byTitle('Older dataset')?.winRateCiLow, byTitle('Older dataset')?.winRateCiHigh, byTitle('Older dataset')?.variants, byTitle('Older dataset')?.sourceTitle],
  [null, null, null, null],
  'a row without the new fields still normalizes, with nulls',
);
for (const title of ['Only a lower bound', 'Bounds reversed', 'Bounds out of range']) {
  assert.deepEqual([byTitle(title)?.winRateCiLow, byTitle(title)?.winRateCiHigh], [null, null], `${title}: a broken interval is dropped whole`);
}
assert.deepEqual([byTitle('Numbers as text')?.winRateCiLow, byTitle('Numbers as text')?.winRateCiHigh, byTitle('Numbers as text')?.variants], [40.7, 66.9, 3]);
assert.deepEqual([byTitle('Not a count')?.variants, byTitle('Negative count')?.variants], [null, null]);

// What a deck says about itself: Russian reasons in order of interest and its filter tags, never an internal code.
const said = (...reasons: string[]) => funDeckWhy(reasons);
assert.deepEqual(said('highlander_shape', 'pkg:reno_highlander', 'card_package', 'meta_core_outlier'),
  { why: ['Пакет: Рено', 'Хайлендер', 'Далеко от меты'], tags: ['highlander'] });
assert.deepEqual(said('meme_low_winrate', 'concept_title'), { why: ['Концепт', 'Мем'], tags: ['meme', 'concept'] });
assert.deepEqual(said('cheese_high_winrate', 'xl_shape', 'meta_core_outlier', 'standard_balance_boost'),
  { why: ['XL-колода', 'Сыр', 'Далеко от меты'], tags: ['xl', 'cheese'] }, 'the score arithmetic code standard_balance_boost says nothing');
assert.deepEqual(said('low_meta_overlap'), { why: ['Мало общего с метой'], tags: [] });
assert.deepEqual(said('highlander_shape', 'xl_shape', 'concept_title', 'pkg:reno_highlander', 'meta_core_outlier').why,
  ['Пакет: Рено', 'Хайлендер', 'XL-колода', 'Концепт', 'Далеко от меты'], 'every reason is sent; the page shows the first three');
assert.deepEqual(said('card_package', 'pkg:a_package_from_the_future').why, ['Пакет карт']);
assert.deepEqual(said('card_package', 'pkg:odd_even', 'rare_archetype_name').why, ['Пакет: Чёт/нечёт', 'Редкий архетип']);
assert.deepEqual(said('title_mismatch_vs_nearest', 'standard_balance_boost', 'wild_concept_boost', 'xl_hl_diversity_tax',
  'neutral_package', 'pkg:quest_package', 'pkg:xl_package', 'a_code_from_the_future'), { why: [], tags: [] });
assert.deepEqual(said(), { why: [], tags: [] });
assert.deepEqual(said('valueOf', 'constructor', 'pkg:toString', 'pkg:constructor'), { why: [], tags: [] }, 'a code named like an Object method is no reason');
assertProperty(fc.property(fc.array(fc.oneof(fc.constantFrom('concept_title', 'card_package', 'pkg:odd_even', 'pkg:xl_package', 'xl_shape',
  'meta_core_outlier', 'standard_balance_boost'), fc.string()), { maxLength: 8 }), reasons => {
  const { why, tags } = funDeckWhy(reasons);
  assert.equal(new Set(why).size, why.length, 'no reason twice');
  for (const label of why) assert.doesNotMatch(label, /[A-Za-z]{3,}|_/, `"${label}" looks like an internal code`);
  assert.ok(tags.length <= 5 && tags.every(tag => ['highlander', 'xl', 'meme', 'cheese', 'concept'].includes(tag)));
}));
const withReasons = normalizeFunDecksPayload({ data: { structured: { rows: [
  { title: 'Reasoned', deck_code: 'R'.repeat(24), format: 'Standard', reasons: ['concept_title', 'xl_shape'] },
] } } }).decks[0];
assert.deepEqual([withReasons.reasons, withReasons.why, withReasons.tags], [['concept_title', 'xl_shape'], ['XL-колода', 'Концепт'], ['xl', 'concept']]);

const publicPayload = normalizePublicFunDecksPayload({
  source_id: 'hsguru_fun_decks',
  fetched_at: '2026-07-25T01:15:16.225405+00:00',
  data: {
    structured: {
      rows: [
        { title: 'Standard', deck_code: 'S'.repeat(24), format: 'Standard' },
        { title: 'Wild', deck_code: 'W'.repeat(24), format: 'Wild' },
      ],
    },
  },
});
assert.deepEqual(publicPayload.stats, { total: 2, standard: 1, wild: 1 });
assert.equal(publicPayload.fetchedAt, '2026-07-25T01:15:16.225405+00:00');
assert.deepEqual(publicPayload.methodology, {
  detectorVersion: null,
  minFunScore: 0.55,
  maxMetaSimilarity: 0.42,
});

let upstreamFails = false;
let labelsFail = false;
let reportedError: unknown;
let scheduledDecks = 0;
const app = express();
const loadFunDecks = async () => {
  if (upstreamFails) throw new Error('secret upstream location');
  return {
    source_id: 'hsguru_fun_decks',
    data: { structured: { rows: [
      { title: 'Deck', deck_code: 'A'.repeat(24), format: 'Standard', nearest_archetype: 'Tog Druid', win_rate_ci_low: 41.5, win_rate_ci_high: 67.2 },
      { title: 'No archetype', deck_code: 'B'.repeat(24), format: 'Wild' },
    ] } },
  };
};
app.use('/api', createPublicFunDecksRouter({
  loadFunDecks,
  loadArchetypeLabels: async () => {
    if (labelsFail) throw new Error('translations unavailable');
    return name => (name === 'Tog Druid' ? 'Вихлепых Друид' : name);
  },
  getPreview: deck => ({
    imageUrl: `https://api.blizzcore.ru/${deck.title}.jpg`,
    previewImageUrl: `https://api.blizzcore.ru/${deck.title}.webp`,
  }),
  schedulePreviews: decks => { scheduledDecks += decks.length; },
  onError: error => { reportedError = error; },
}));
app.use('/api', createAdminFunDecksRouter({
  adminGuard: (request, response, next) => (
    request.headers['x-test-admin'] === '1'
      ? next()
      : response.status(401).json({ error: 'Требуется вход' })
  ),
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  loadFunDecks,
  onError: error => { reportedError = error; },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const endpoint = `http://127.0.0.1:${address.port}/api/admin/fun-decks`;

try {
  const publicResponse = await fetch(`http://127.0.0.1:${address.port}/api/fun-decks`);
  assert.equal(publicResponse.status, 200);
  assert.match(publicResponse.headers.get('cache-control') || '', /public, max-age=300/);
  const publicResponsePayload = await publicResponse.json() as any;
  assert.deepEqual(publicResponsePayload.stats, { total: 2, standard: 1, wild: 1 });
  assert.equal(publicResponsePayload.methodology.minFunScore, 0.55);
  assert.equal('cadence' in publicResponsePayload, false);
  assert.equal('filters' in publicResponsePayload, false);
  const [standardDeck, wildDeck] = ['Deck', 'No archetype'].map(title => publicResponsePayload.decks.find((deck: any) => deck.title === title));
  assert.equal(standardDeck.render.previewImageUrl, 'https://api.blizzcore.ru/Deck.webp');
  assert.equal(standardDeck.nearestArchetypeLabel, 'Вихлепых Друид', 'the nearest archetype comes with its Russian name');
  assert.deepEqual([standardDeck.winRateCiLow, standardDeck.winRateCiHigh], [41.5, 67.2]);
  assert.deepEqual([wildDeck.nearestArchetypeLabel, wildDeck.winRateCiLow, wildDeck.variants, wildDeck.sourceTitle], [null, null, null, null]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(scheduledDecks, 2);

  // The Russian names are a nicety: without them the selection still loads, with the English name only.
  labelsFail = true;
  const withoutLabels = await fetch(`http://127.0.0.1:${address.port}/api/fun-decks`);
  assert.equal(withoutLabels.status, 200);
  const withoutLabelsDeck = (await withoutLabels.json() as any).decks.find((deck: any) => deck.title === 'Deck');
  assert.deepEqual([withoutLabelsDeck.nearestArchetype, withoutLabelsDeck.nearestArchetypeLabel], ['Tog Druid', null]);
  assert.match(String(reportedError instanceof Error ? reportedError.message : reportedError), /translations unavailable/);
  labelsFail = false;

  assert.equal((await fetch(endpoint)).status, 401);

  const response = await fetch(endpoint, { headers: { 'X-Test-Admin': '1' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal((await response.json() as any).decks.length, 2);

  upstreamFails = true;
  const failed = await fetch(endpoint, { headers: { 'X-Test-Admin': '1' } });
  assert.equal(failed.status, 502);
  const failure = await failed.json() as any;
  assert.equal(failure.code, 'FUN_DECKS_UNAVAILABLE');
  assert.equal(failure.error, 'Не удалось загрузить фановые колоды');
  assert.ok(reportedError instanceof Error);
  assert.equal(JSON.stringify(failure).includes('secret upstream location'), false);

  const publicFailure = await fetch(`http://127.0.0.1:${address.port}/api/fun-decks`);
  assert.equal(publicFailure.status, 502);
  assert.equal(publicFailure.headers.get('cache-control'), 'no-store');
  assert.equal(JSON.stringify(await publicFailure.json()).includes('secret upstream location'), false);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin fun decks routes tests passed');
