import assert from 'node:assert/strict';
import express from 'express';
import { createAdminArchetypesRouter } from '../server/adminArchetypesRoutes.js';

const detailPayload = {
  snapshot: { name: 'HSReplay Mage', player_class: 'MAGE' },
  decks: [{ id: 1, cards: [{ dbf_id: 555, count: 2 }] }],
  mulligan: [],
  matchups: [],
  history: [],
};

const app = express();
app.use('/api', createAdminArchetypesRouter({
  adminGuard: (_request, _response, next) => next(),
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  loadArchetypes: async () => [],
  loadStandardSnapshots: async () => [
    {
      archetype_id: 856,
      name: 'HSReplay Mage',
      player_class: 'MAGE',
      win_rate: 53,
      pct_of_total: 1,
      total_games: 10_000,
    },
    {
      archetype_id: 857,
      name: 'HSReplay Fire Mage',
      player_class: 'MAGE',
      win_rate: 54,
      pct_of_total: 2.5,
      total_games: 25_000,
    },
    {
      archetype_id: 858,
      name: 'HSReplay Empty Mage',
      player_class: 'MAGE',
      win_rate: null,
      pct_of_total: null,
      total_games: null,
    },
  ],
  loadWildMeta: async () => [],
  loadWildDecks: async () => [],
  loadDetail: async () => ({ status: 200, payload: structuredClone(detailPayload) }),
  translateArchetype: name => name === 'Burn Mage' ? 'Берн Маг' : name,
  resolveCanonicalArchetype: async ({ archetypeId, sourceNameEn, detail }) => {
    assert.notEqual(archetypeId, 858, 'rows without catalog statistics should be filtered before identity requests');
    assert.ok(detail);
    return {
      sourceNameEn,
      canonicalNameEn: 'Burn Mage',
      canonicalNameRu: 'Берн Маг',
      identitySource: 'local-deck-match',
      identityConfidence: 0.84,
    };
  },
  loadCanonicalMatchups: async canonicalNameEn => {
    assert.equal(canonicalNameEn, 'Burn Mage');
    return [{
      opponent_archetype_id: 1,
      opponent_name: 'Контроль Жрец',
      opponent_name_en: 'Control Priest',
      opponent_class: 'PRIEST',
      win_rate: 54.2,
      total_games: null,
    }];
  },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}/api/admin/archetypes`;

try {
  const catalog = await fetch(`${origin}?format=standard`);
  assert.equal(catalog.status, 200);
  const catalogBody = await catalog.json() as any;
  assert.equal(catalogBody.count, 1);
  assert.equal(catalogBody.items.length, 1);
  assert.equal(catalogBody.items[0].id, 857);
  assert.equal(catalogBody.items[0].nameEn, 'Burn Mage');
  assert.equal(catalogBody.items[0].nameRu, 'Берн Маг');
  assert.equal(catalogBody.items[0].sourceNameEn, 'HSReplay Fire Mage');
  assert.equal(catalogBody.items[0].identitySource, 'local-deck-match');
  assert.equal(catalogBody.items[0].stats.games, 25_000);

  const detail = await fetch(`${origin}/856?format=standard`);
  assert.equal(detail.status, 200);
  const detailBody = await detail.json() as any;
  assert.equal(detailBody.data.snapshot.name, 'HSReplay Mage');
  assert.equal(detailBody.data.snapshot.canonicalNameEn, 'Burn Mage');
  assert.equal(detailBody.data.snapshot.canonicalNameRu, 'Берн Маг');
  assert.equal(detailBody.data.snapshot.identityConfidence, 0.84);
  assert.equal(detailBody.data.matchupsSource, 'hsguru');
  assert.equal(detailBody.data.matchups[0].opponent_name_en, 'Control Priest');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin archetypes router tests passed');
