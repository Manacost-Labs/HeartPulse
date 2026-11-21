import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mock, test } from 'node:test';
import { createArchetypeCardDictionaries } from '../server/archetypeCardDictionaries.js';
import { loadHsjsonAllCards, resolveDeckPayload } from '../server/deckBuilderRoutes.js';
import { publicArchetypeDetail } from '../server/publicArchetypeDetail.js';
import { openBuildCards } from '../src/features/archetypeOpenBuilds.js';
import { funDeckCardArt } from '../src/features/funDecks/deckEntries.js';

// The three Rangers in the production N'Zoth Mech Hunter code. The shipped
// Russian dictionary has prerelease DBFs; the format catalog has only Sylvanas.
const deckCode = 'AAECAR8GmacHmqcHm6cHhesHn/YHqYcIDKmfBM6bB7TAB9faB9vaB8XwB4D2B5z2B532B572B6SBCNGICAAA';
const sylvanas = 'Командир следопытов Сильвана';
const alleria = 'Капитан следопытов Аллерия';
const vereesa = 'Посвященный следопыт Вериса';
const legacy = {
  TIME_609: { dbf: 119705, name: sylvanas, mana: 3 },
  TIME_609t1: { dbf: 119706, name: sylvanas + ' (2 - ' + alleria + ')', mana: 3 },
  TIME_609t2: { dbf: 119707, name: sylvanas + ' (1 - ' + vereesa + ')', mana: 3 },
};
const official = [
  { id: 'TIME_609', dbfId: 119707, name: sylvanas, cost: 3 },
  { id: 'TIME_609t1', dbfId: 119705, name: alleria, cost: 3 },
  { id: 'TIME_609t2', dbfId: 119706, name: vereesa, cost: 3 },
];
const format = 'standard' as const;
const formatCards = [{ card_id: 'TIME_609', dbf: 119707, name: sylvanas, mana_cost: 3 }];
const catalog = { format, formatLabel: 'Стандарт', patch: '', minimumGames: 50, updatedAt: null };
const item = { slug: 'n-zoth-mech-hunter', archetype: 'N’Zoth Mech Hunter', archetypeLabel: 'Н’Зот Мех Охотник',
  format, classKey: 'hunter', translated: true, games: 100, winrate: null, popularity: null, turns: null,
  durationMinutes: null, climbingSpeed: null, deckCount: 1, sourceUrl: '',
  builds: [{ deckCode, games: 100, winrate: null, updatedAt: null, sampleRank: 'all', samplePeriod: 'past_week' }] };

function visibleCards(cards: readonly { id: string; name: string }[]) {
  return cards.map(({ id, name }) => [name, funDeckCardArt(id, 'row'), funDeckCardArt(id, 'portrait')]);
}

test('open Ranger names and artwork survive replacement by the deck resolver, including a cold dictionary', async () => {
  let online = false;
  const network = mock.method(globalThis, 'fetch', async (url: string) =>
    String(url).includes('api.hearthstonejson.com') && online ? Response.json(official) : new Response(null, { status: 503 }));
  const db = new DatabaseSync(':memory:');
  try {
    const dependencies = { adminGuard: () => {}, setPrivateNoStore: () => {}, getDatabase: () => db,
      loadCardsRu: () => legacy, loadArchetypeTranslations: async () => ({}), loadCatalogCards: async () => formatCards };
    const readOpen = async () => {
      const dictionaries = createArchetypeCardDictionaries({ local: () => legacy,
        remote: async () => (await loadHsjsonAllCards()).byId, deadlineMs: 500 });
      const answer = publicArchetypeDetail(catalog, item, formatCards, 0, await dictionaries());
      const cards = openBuildCards(answer.item.builds[0], format);
      assert.ok(cards);
      return visibleCards(cards);
    };
    const coldOpen = await readOpen();
    const coldFull = await resolveDeckPayload(dependencies, deckCode, format);
    online = true;
    const warmOpen = await readOpen();
    const warmFull = await resolveDeckPayload(dependencies, deckCode, format);
    const expected = visibleCards([official[1], official[0], official[2]]);
    assert.deepEqual(visibleCards(warmFull.cards), expected);
    assert.deepEqual(warmOpen, expected, 'warm open and full rows');
    assert.deepEqual(coldOpen, expected, 'the first public response before the official dictionary arrives');
    assert.deepEqual(visibleCards(coldFull.cards), expected, 'the full resolver during an outage');
  } finally {
    network.mock.restore();
    db.close();
  }
});
