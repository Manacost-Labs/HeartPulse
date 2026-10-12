import assert from 'node:assert/strict';
import test from 'node:test';
import { changeDeckCopies, deckCount, type BuilderCard, type BuilderEntry } from '../src/modules/deckBuilder/model/selection';
import { loadDeckCatalog, deckDownloadUrl } from '../src/modules/deckBuilder/api/client';
import { changeSideboard, configurationIssues, configurationKind } from '../src/modules/deckBuilder/model/configuration';
import { loadCardConfiguration } from '../src/modules/deckBuilder/api/configuration';
import { deckSizeLimit } from '../src/features/deckBuilderRules';
import { gameRulesFromCards, isLegalDeckCard, legalityIssues, rebalanceRunes } from '../src/modules/deckBuilder/model/legality';

const card: BuilderCard = {
  id: 'EX1_001', dbfId: 1, name: 'Карта', cost: 2, rarity: 'COMMON',
  classes: ['NEUTRAL'], image: '', tile: '',
};
const limit = (deck: { dbfId: number }[]) => deck.some(c => c.dbfId === 79767) ? 40 : 30;

test('tourists allow only destination Paradise cards and cannot chain; rune requirements include the ETC band', () => {
  const rules = gameRulesFromCards([
    { id: 'VAC_424', set: 'ISLAND_VACATION', text: '<b>Paladin Tourist</b>' },
    { id: 'VAC_507', set: 'ISLAND_VACATION', text: '<b>Rogue Tourist</b>' },
    { id: 'DK_CARD', runeCost: { blood: 2, frost: 0, unholy: 0 } },
  ]);
  const tourist = { ...card, id: 'VAC_424', classes: ['MAGE'], count: 1 };
  const guest = { ...card, id: 'VAC_435', dbfId: 44, classes: ['PALADIN'], set: 'ISLAND_VACATION' };
  const runes = { blood: 1, frost: 1, unholy: 1 };
  assert.equal(isLegalDeckCard(guest, 'MAGE', [tourist], rules, runes), true);
  assert.equal(isLegalDeckCard({ ...guest, set: 'CORE' }, 'MAGE', [tourist], rules, runes), false);
  assert.equal(isLegalDeckCard({ ...guest, id: 'VAC_507' }, 'MAGE', [tourist], rules, runes), false);
  assert.equal(isLegalDeckCard(guest, 'MAGE', [], rules, runes), false);
  const dk = { ...card, id: 'DK_CARD', classes: ['DEATHKNIGHT'], count: 1 };
  assert.equal(isLegalDeckCard(dk, 'DEATHKNIGHT', [], rules, runes), false);
  const blood = rebalanceRunes(runes, 'blood', 3);
  assert.deepEqual(blood, { blood: 3, frost: 0, unholy: 0 });
  assert.equal(isLegalDeckCard(dk, 'DEATHKNIGHT', [], rules, blood), true);
  const etc = { ...card, id: 'ETC_080', count: 1, sideboard: [dk] };
  assert.equal(legalityIssues([etc], 'DEATHKNIGHT', rules, runes).length, 1);
  assert.deepEqual(legalityIssues([etc], 'DEATHKNIGHT', rules, blood), []);
});

test('forty-card decks require an actual deck-size modifier rather than a different Rafaam', () => {
  assert.equal(deckSizeLimit([{ dbfId: 52119 }]), 30);
  assert.equal(deckSizeLimit([{ dbfId: 111455 }]), 30);
  for (const dbfId of [79767, 111689, 119432]) assert.equal(deckSizeLimit([{ dbfId }]), 40);
});

test('ETC shares copy limits with the main deck and has exactly three separate slots', () => {
  const owner = { ...card, id: 'ETC_080', dbfId: 90749, rarity: 'LEGENDARY', count: 1 };
  const config = { kind: 'etc' as const, modules: [], art: [], banned: ['TOY_330', 'ETC_080'] };
  let deck: BuilderEntry[] = [owner, { ...card, count: 1 }];
  deck = changeSideboard(deck, owner.dbfId, card, 1, 'MAGE', config);
  assert.equal(deckCount(deck), 2);
  assert.equal(deck[0].sideboard?.[0].count, 1);
  assert.deepEqual(changeDeckCopies(deck, card, 1, 'MAGE', limit), deck);
  assert.deepEqual(changeSideboard(deck, owner.dbfId, card, 1, 'MAGE', config), deck);
  assert.deepEqual(changeSideboard(deck, owner.dbfId, owner, 1, 'MAGE', config), deck);
  assert.deepEqual(changeSideboard(deck, owner.dbfId, { ...card, id: 'TOY_330' }, 1, 'MAGE', config), deck);
  assert.deepEqual(changeSideboard(deck, owner.dbfId, { ...card, dbfId: 12, classes: ['WARRIOR'] }, 1, 'MAGE', config), deck);
  deck = changeSideboard(deck, owner.dbfId, { ...card, dbfId: 2 }, 1, 'MAGE', config);
  deck = changeSideboard(deck, owner.dbfId, { ...card, dbfId: 3 }, 1, 'MAGE', config);
  assert.deepEqual(configurationIssues(deck), []);
  assert.deepEqual(changeSideboard(deck, owner.dbfId, { ...card, dbfId: 4 }, 1, 'MAGE', config), deck);
  assert.equal(configurationIssues(changeSideboard(deck, owner.dbfId, card, -1, 'MAGE', config)).length, 1);
});

test('Zilliax requires two different functional modules and one cosmetic module', () => {
  const owner = { ...card, id: 'TOY_330', dbfId: 102983, rarity: 'LEGENDARY', count: 1 };
  const modules = [92, 93, 94].map((n, index) => ({ ...card, id: `TOY_330t${n}`, dbfId: 104944 + index, cost: index + 1 }));
  const art = [{ ...card, id: 'TOY_330t5', dbfId: 110440, cost: 0 }];
  const config = { kind: 'zilliax' as const, modules, art, banned: [] };
  let deck: BuilderEntry[] = [owner];
  assert.equal(configurationKind(owner), 'zilliax');
  assert.equal(configurationIssues(deck).length, 1);
  deck = changeSideboard(deck, owner.dbfId, modules[0], 1, 'MAGE', config);
  assert.deepEqual(changeSideboard(deck, owner.dbfId, modules[0], 1, 'MAGE', config), deck);
  deck = changeSideboard(deck, owner.dbfId, modules[1], 1, 'MAGE', config);
  assert.equal(deck[0].sideboard?.length, 3);
  assert.equal(deck[0].cost, 3);
  assert.equal(deckCount(deck), 1);
  assert.deepEqual(configurationIssues(deck), []);
  assert.deepEqual(changeSideboard(deck, owner.dbfId, modules[2], 1, 'MAGE', config), deck);
  assert.deepEqual(changeSideboard(deck, owner.dbfId, card, 1, 'MAGE', config), deck);
  assert.equal(configurationIssues(changeSideboard(deck, owner.dbfId, modules[0], -1, 'MAGE', config)).length, 1);
  assert.deepEqual(changeDeckCopies(deck, deck[0], -1, 'MAGE', limit), []);
});

test('configuration loader validates owner identity, complete module pools and ETC exclusion metadata', async () => {
  const owner = { ...card, id: 'TOY_330', dbfId: 102983 };
  const modules = Array.from({ length: 8 }, (_, index) => ({ card_id: `TOY_330t${92 + index}`, dbf: 104944 + index,
    class: 'NEUTRAL', name: { ru: `Модуль ${index}` }, mana_cost: index, images: { card: 'https://evil.test/module.png' } }));
  const art = { ...modules[0], card_id: 'TOY_330t5', dbf: 110440 };
  const payload = { card: { card_id: owner.id, dbf: owner.dbfId, related_cards_localized: [{ cards: [...modules, art] }] } };
  const signal = new AbortController().signal;
  const configured = await loadCardConfiguration(owner, signal, async () => Response.json(payload));
  assert.equal(configured.modules.length, 8);
  assert.equal(configured.art.length, 1);
  assert.match(configured.modules[0].image, /^\/api\/card-image\//);
  await assert.rejects(loadCardConfiguration(owner, signal, async () => Response.json({ card: { ...payload.card, dbf: 10 } })), /карта/);
  await assert.rejects(loadCardConfiguration(owner, signal, async () => Response.json({ card: { ...payload.card, related_cards_localized: [] } })), /модули/);
  const etc = { ...card, id: 'ETC_080', dbfId: 90749 };
  const etcPayload = { card: { card_id: etc.id, dbf: etc.dbfId, wiki: { generated_card_pools: [
    { pool: "Cards banned from E.T.C.'s band", card_ids: ['ETC_080', 'TOY_330', 'REV_018'] },
  ] } } };
  assert.deepEqual((await loadCardConfiguration(etc, signal, async () => Response.json(etcPayload))).banned, ['ETC_080', 'TOY_330', 'REV_018']);
  await assert.rejects(loadCardConfiguration(etc, signal, async () => Response.json({ card: { card_id: etc.id, dbf: etc.dbfId } })), /ограничения/);
});

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
