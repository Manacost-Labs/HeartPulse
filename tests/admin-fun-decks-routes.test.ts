import assert from 'node:assert/strict';
import express from 'express';
import {
  createAdminFunDecksRouter,
  createPublicFunDecksRouter,
  normalizeFunDecksPayload,
  normalizePublicFunDecksPayload,
} from '../server/adminFunDecksRoutes.js';

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
let reportedError: unknown;
let scheduledDecks = 0;
const app = express();
const loadFunDecks = async () => {
  if (upstreamFails) throw new Error('secret upstream location');
  return {
    source_id: 'hsguru_fun_decks',
    data: { structured: { rows: [{ title: 'Deck', deck_code: 'A'.repeat(24), format: 'Standard' }] } },
  };
};
app.use('/api', createPublicFunDecksRouter({
  loadFunDecks,
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
  assert.deepEqual(publicResponsePayload.stats, { total: 1, standard: 1, wild: 0 });
  assert.equal(publicResponsePayload.methodology.minFunScore, 0.55);
  assert.equal('cadence' in publicResponsePayload, false);
  assert.equal('filters' in publicResponsePayload, false);
  assert.equal(publicResponsePayload.decks[0].render.previewImageUrl, 'https://api.blizzcore.ru/Deck.webp');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(scheduledDecks, 1);

  assert.equal((await fetch(endpoint)).status, 401);

  const response = await fetch(endpoint, { headers: { 'X-Test-Admin': '1' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal((await response.json() as any).decks.length, 1);

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
