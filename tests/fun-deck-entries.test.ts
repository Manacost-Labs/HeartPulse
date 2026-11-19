import assert from 'node:assert/strict';
import type { DeckListCard, DeckListSideboard } from '../src/features/decklist/DeckListView';
import { funDeckCardArt, funDeckEntries, funDeckManaCurve } from '../src/features/funDecks/deckEntries';

function card(id: string, dbfId: number, name: string, cost: number, count = 1): DeckListCard {
  return { id, dbfId, name, cost, rarity: 'COMMON', elite: false, count, image: '' };
}

const zilliax = card('TOY_330', 102983, 'Зиллиакс Делюкс 3000', 0);
const etc = card('ETC_080', 90749, 'Музыкальный менеджер E.T.C.', 4);
const cards = [
  card('EX1_049', 1, 'Молодой хмелевар', 2, 2),
  etc,
  card('JAM_022', 2, 'Оглушение', 1, 2),
  zilliax,
  card('DRG_082', 3, 'Вороватый кобольд', 5),
  card('VAC_404', 4, 'Аквариум', 0),
];
const sideboards: DeckListSideboard[] = [
  {
    keyCardDbfId: 102983,
    label: 'Зиллиакс Делюкс 3000',
    cards: [
      card('TOY_330t11', 10, 'Зиллиакс Делюкс 3000', 0),
      card('TOY_330t99', 11, 'Идеальный модуль', 5),
      card('TOY_330t97', 12, 'Дублирующий модуль', 4),
    ],
  },
  {
    keyCardDbfId: 90749,
    label: 'Музыкальный менеджер E.T.C.',
    cards: [card('RLK_951', 13, 'Коронер', 2), card('GVG_074', 14, 'Мистик Кезана', 4)],
  },
];

const entries = funDeckEntries(cards, sideboards);

// A built Zilliax leads the list, costs its two modules and shows only them.
assert.equal(entries[0].card.id, 'TOY_330');
assert.equal(entries[0].configuredCost, 9);
assert.equal(entries[0].sideboardLabel, 'Модули Зиллиакса');
assert.deepEqual(entries[0].sideboard.map(item => item.id), ['TOY_330t97', 'TOY_330t99']);

// The rest follow the mana curve; E.T.C. keeps its band under it.
assert.deepEqual(entries.map(entry => entry.card.id), ['TOY_330', 'VAC_404', 'JAM_022', 'EX1_049', 'ETC_080', 'DRG_082']);
const band = entries[4];
assert.equal(band.sideboardLabel, 'Группа E.T.C.');
assert.deepEqual(band.sideboard.map(item => item.id), ['RLK_951', 'GVG_074']);
assert.equal(entries[2].sideboardLabel, null);

// The curve counts copies, with Zilliax at 9 mana in the 7+ bucket.
assert.deepEqual(funDeckManaCurve(entries), [1, 2, 2, 0, 1, 1, 0, 1]);

// Zilliax without a configuration is an ordinary 0-mana card.
const plain = funDeckEntries([card('DRG_082', 3, 'Вороватый кобольд', 5), card('TOY_330', 102983, 'Зиллиакс Делюкс 3000', 0)]);
assert.deepEqual(plain.map(entry => [entry.card.id, entry.configuredCost]), [['TOY_330', null], ['DRG_082', null]]);

assert.equal(funDeckCardArt('CORE_EX1_049', 'row'), '/api/card-image/CORE_EX1_049/row.webp?v=deck_art_v1');
assert.equal(funDeckCardArt('TOY_330t97', 'portrait'), '/api/card-image/TOY_330t97/portrait.webp?v=deck_art_v1');
