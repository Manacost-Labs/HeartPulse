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
  loadStandardSnapshots: async () => [{
    archetype_id: 856,
    name: 'HSReplay Mage',
    player_class: 'MAGE',
    win_rate: 53,
    total_games: 10_000,
  }],
  loadWildMeta: async () => [],
  loadWildDecks: async () => [],
  loadDetail: async () => ({ status: 200, payload: structuredClone(detailPayload) }),
  translateArchetype: name => name === 'Burn Mage' ? 'Берн Маг' : name,
  resolveCanonicalArchetype: async ({ archetypeId, detail }) => {
    assert.equal(archetypeId, 856);
    assert.ok(detail);
    return {
      sourceNameEn: 'HSReplay Mage',
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
  assert.equal(catalogBody.items[0].nameEn, 'Burn Mage');
  assert.equal(catalogBody.items[0].nameRu, 'Берн Маг');
  assert.equal(catalogBody.items[0].sourceNameEn, 'HSReplay Mage');
  assert.equal(catalogBody.items[0].identitySource, 'local-deck-match');

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
