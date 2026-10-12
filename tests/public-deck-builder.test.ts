import assert from 'node:assert/strict';
import test from 'node:test';
import { changeDeckCopies, deckCount, type BuilderCard } from '../src/modules/deckBuilder/model/selection';
import { loadDeckCatalog, deckDownloadUrl } from '../src/modules/deckBuilder/api/client';

const card: BuilderCard = {
  id: 'EX1_001', dbfId: 1, name: 'Карта', cost: 2, rarity: 'COMMON',
  classes: ['NEUTRAL'], image: '', tile: '',
};
const limit = (deck: { dbfId: number }[]) => deck.some(c => c.dbfId === 79767) ? 40 : 30;

test('copy limits and removal preserve the deck count', () => {
  const one = changeDeckCopies([], card, 1, 'MAGE', limit);
  const two = changeDeckCopies(one, card, 1, 'MAGE', limit);
  assert.equal(deckCount(two), 2);
  assert.deepEqual(changeDeckCopies(two, card, 1, 'MAGE', limit), two);
  assert.deepEqual(changeDeckCopies(one, card, -1, 'MAGE', limit), []);
  const legendary = { ...card, rarity: 'LEGENDARY' };
  const single = changeDeckCopies([], legendary, 1, 'MAGE', limit);
  assert.deepEqual(changeDeckCopies(single, legendary, 1, 'MAGE', limit), single);
});

test('foreign classes are rejected while dual class and neutral cards are accepted', () => {
  assert.deepEqual(changeDeckCopies([], { ...card, classes: ['WARRIOR'] }, 1, 'MAGE', limit), []);
  assert.equal(deckCount(changeDeckCopies([], { ...card, classes: ['MAGE', 'ROGUE'] }, 1, 'MAGE', limit)), 1);
});

test('a deck-size modifier can be added at thirty cards; overfull decks can be repaired', () => {
  const full = Array.from({ length: 15 }, (_, i) => ({ ...card, dbfId: i + 1, count: 2 }));
  assert.equal(deckCount(changeDeckCopies(full, { ...card, dbfId: 20 }, 1, 'MAGE', limit)), 30);
  const xl = changeDeckCopies(full, { ...card, dbfId: 79767, rarity: 'LEGENDARY' }, 1, 'MAGE', limit);
  assert.equal(deckCount(xl), 31);
  assert.equal(deckCount(changeDeckCopies(xl, xl.at(-1)!, -1, 'MAGE', limit)), 30);
});

test('catalog preserves Koloda tile URLs and rejects invalid identities and foreign cards', async () => {
  const source = { card_id: 'EX1_001', dbf: 1, class: 'MAGE', name: { ru: 'Карта' },
    mana_cost: 2, rarity: 'COMMON', images: {
      card: 'https://api.kolodahearthstone.com/uploads/card.png',
      tile: 'https://api.kolodahearthstone.com/uploads/card-tiles/test.png',
    } };
  let requested = '';
  const fetcher = async (input: string | URL | Request) => {
    requested = String(input);
    return Response.json({ cards: [source, { ...source, dbf: null }, { ...source, class: 'WARRIOR' }],
      pagination: { page: 1, totalPages: 2, total: 65 } });
  };
  const result = await loadDeckCatalog({ heroClass: 'MAGE', format: 'standard', query: '  маг  ',
    mana: '', rarity: '', pool: '', page: 1 }, new AbortController().signal, fetcher);
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].tile, '/api/public-resource/db/uploads/card-tiles/test.png');
  const url = new URL(requested, 'https://hearthpulse.net');
  assert.equal(url.searchParams.get('deckClass'), 'MAGE');
  assert.equal(url.searchParams.get('query'), 'маг');
  assert.equal(url.searchParams.get('format'), 'standard');
});

test('malformed catalog responses fail explicitly rather than pretending the pool is empty', async () => {
  await assert.rejects(loadDeckCatalog({ heroClass: 'MAGE', format: 'wild', query: '', mana: '',
    rarity: '', pool: '', page: 1 }, new AbortController().signal,
  async () => Response.json({ cards: 'broken' })), /каталог/);
});

test('downloads accept only the same-origin Deckview resource boundary', () => {
  assert.equal(deckDownloadUrl('https://api.blizzcore.ru/static/generated/deck.jpg'),
    '/api/public-resource/deckview/static/generated/deck.jpg');
  assert.throws(() => deckDownloadUrl('https://evil.test/file.jpg'));
  assert.throws(() => deckDownloadUrl('//evil.test/file.jpg'));
  assert.throws(() => deckDownloadUrl('javascript:alert(1)'));
});

test('catalog sends all collection filters and sorting, and normalizes public facets', async () => {
  let requested = '';
  const result = await loadDeckCatalog({ heroClass: 'DRUID', format: 'wild', query: '',
    mana: '10+', rarity: 'LEGENDARY', pool: 'class', page: 2,
    set: 'CORE', type: 'MINION', mechanic: 'TAUNT', minionType: 'BEAST', spellSchool: '',
    sort: 'set', direction: 'desc' }, new AbortController().signal, async input => {
    requested = String(input);
    return Response.json({ cards: [], pagination: { totalPages: 3, total: 70 },
      facets: { sets: ['CORE'], types: ['minion', 'MINION', 123], mechanics: ['TAUNT'], minionTypes: ['BEAST'] },
      mechanicTranslations: { TAUNT: 'Провокация', INVALID: 7 } });
  });
  const params = new URL(requested, 'https://hearthpulse.net').searchParams;
  for (const [key, value] of Object.entries({ set: 'CORE', type: 'MINION', mechanic: 'TAUNT', minionType: 'BEAST',
    sort: 'set', direction: 'desc', mana: '10+', class: 'DRUID', page: '2' })) assert.equal(params.get(key), value);
  assert.equal(params.has('spellSchool'), false);
  assert.deepEqual(result.facets?.types, ['MINION']);
  assert.equal(result.mechanicTranslations?.TAUNT, 'Провокация');
  assert.equal(result.mechanicTranslations?.INVALID, undefined);
});
