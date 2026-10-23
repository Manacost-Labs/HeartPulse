import assert from 'node:assert/strict';
import { createBattlegroundLibraryCardLookup, enrichBattlegroundHeroCards, type BattlegroundLibraryCard } from '../server/battlegroundHeroCards.js';

const library: Record<string, BattlegroundLibraryCard> = {
  58400: { card_id: 'TB_BaconUps_045', variant: { kind: 'golden', base_card_id: 'BG_LOE_077' }, name: { ru: 'Бранн Бронзобород', en: 'Brann Bronzebeard' }, tavern_tier: 5 },
  72062: { card_id: 'BG21_015', variant: { kind: 'base' }, name: { ru: 'Таресгоса', en: 'Tarecgosa' }, tavern_tier: 2, creature_type: { slug: 'dragon', name_ru: 'Дракон' }, text_ru: 'Навсегда сохраняет бонусы.' },
};
const payload = {
  stats: {
    best_composition: {
      lineup: [{ dbfId: 58400, name: 'Brann Bronzebeard', premium: true }],
      final_form_minions: [{ dbfId: 72062, name: 'Tarecgosa' }, { dbfId: 90425, name: 'Leeroy the Reckless' }, { dbfId: 72062, name: 'Tarecgosa' }],
    },
  },
  cards: { 58400: { dbf: 58400, card_id: 'TB_BaconUps_045', name: 'Бранн Бронзобород', image: 'framed.png' } } as Record<string, Record<string, unknown>>,
};
const asked: string[] = [];
const enriched = await enrichBattlegroundHeroCards(payload, async dbf => {
  asked.push(dbf);
  if (dbf === '90425') throw new Error('upstream down');
  return library[dbf] ?? null;
});

assert.deepEqual(asked.sort(), ['58400', '72062', '90425'], 'every lineup and final-board minion is looked up once');
// A final-board minion the details payload lacked gets its Russian name and base id.
assert.deepEqual(enriched.cards['72062'], {
  dbf: 72062, card_id: 'BG21_015', name: 'Таресгоса', text: 'Навсегда сохраняет бонусы.', tavern_tier: 2,
  creature_type: 'dragon', creature_type_name: 'Дракон', base_card_id: 'BG21_015',
});
// A golden id that no pattern maps keeps the payload's fields and learns its base card.
assert.equal(enriched.cards['58400'].image, 'framed.png');
assert.equal(enriched.cards['58400'].base_card_id, 'BG_LOE_077');
// A failed lookup leaves the minion out: the page falls back to the English name.
assert.equal(enriched.cards['90425'], undefined);
assert.equal(payload.cards['58400'].hasOwnProperty('base_card_id'), false, 'the upstream payload is not mutated');
assert.equal(await enrichBattlegroundHeroCards({ stats: {} }, async () => { throw new Error('not called'); }).then(result => result.stats !== undefined), true);

// The lookup caches hits and misses per dbf.
let requests = 0;
const lookup = createBattlegroundLibraryCardLookup({
  baseUrl: 'http://bg.test',
  fetchImpl: (async (url: URL) => {
    requests += 1;
    return url.pathname.endsWith('/72062') ? new Response(JSON.stringify(library[72062])) : new Response('{}', { status: 502 });
  }) as typeof fetch,
});
assert.equal((await lookup('72062'))?.name?.ru, 'Таресгоса');
await lookup('72062');
assert.equal(await lookup('1'), null);
await lookup('1');
assert.equal(requests, 2);
