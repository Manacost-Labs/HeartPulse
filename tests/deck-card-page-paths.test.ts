import assert from 'node:assert/strict';
import type { DeckBuilderResolvedCard, DeckBuilderResolveResult } from '../server/deckBuilderResolve.js';
import { withCardPagePaths } from '../server/deckCardPagePaths.js';

function card(id: string, dbfId: number): DeckBuilderResolvedCard {
  return {
    id, dbfId, name: id, cost: 1, rarity: 'COMMON', elite: false, count: 1,
    image: '', cardImage: '', collectible: true, sideboardKeyDbfId: null,
  };
}

function deck(format: 'standard' | 'wild', cards: DeckBuilderResolvedCard[], sideboardCards: DeckBuilderResolvedCard[] = []): DeckBuilderResolveResult {
  return {
    format, heroDbfId: 7, deckCode: 'code', cards,
    sideboards: sideboardCards.length ? [{ keyCardDbfId: 102983, keyCard: card('TOY_330', 102983), label: 'Зиллиакс', cards: sideboardCards }] : [],
    totalCards: cards.length, deckSizeLimit: 30, archetype: null,
  };
}

const catalogs = {
  standard: [{ card_id: 'EDR_813' }, { card_id: 'TOY_330' }],
  wild: [{ card_id: 'EDR_813' }, { card_id: 'EX1_049' }, { card_id: 'TOY_330' }, { id: 'GVG_074' }],
};

// Standard cards link to their Standard page; a module token has no page even if the deck marks it collectible.
const standard = withCardPagePaths(deck('standard', [card('EDR_813', 1)], [card('TOY_330t97', 2)]), catalogs);
assert.equal(standard.cards[0].pagePath, '/standard/cards/standard/EDR_813/');
assert.equal(standard.sideboards[0].cards[0].pagePath, null);
assert.equal(standard.sideboards[0].keyCard?.pagePath, '/standard/cards/standard/TOY_330/');

// A Wild Core reprint missing from the catalog opens its original card; unknown cards stay plain.
const wild = withCardPagePaths(deck('wild', [card('CORE_EX1_049', 3), card('GVG_074', 4), card('TIME_875t', 5)]), catalogs);
assert.deepEqual(wild.cards.map(item => item.pagePath), [
  '/standard/cards/wild/EX1_049/',
  '/standard/cards/wild/GVG_074/',
  null,
]);

// A Standard deck card known only to the Wild catalog still gets the Wild page.
const older = withCardPagePaths(deck('standard', [card('EX1_049', 6)]), catalogs);
assert.equal(older.cards[0].pagePath, '/standard/cards/wild/EX1_049/');
