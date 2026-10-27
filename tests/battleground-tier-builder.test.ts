import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTierBuilderCards, createTierBuilderHistory, DEFAULT_TIER_BUILDER_FILTERS, matchesTierBuilderFilters, placedTierBuilderCount,
  readTierBuilderDraft, tierBuilderCardImage, tierBuilderDraft, unresolvedTierBuilderDraft, withTierBuilderSource,
} from '../src/modules/battlegrounds/model/tierBuilder';

const proxied = (url: string) => `/api/public-resource/${encodeURIComponent(url)}`;
const cards = buildTierBuilderCards({
  library: { cards: [
    { id: 'BG_1', dbfId: 1, name: 'Мурлок-разведчик', text: 'Боевой клич', techLevel: 1, races: ['MURLOC'], artUrl: 'https://art.example/murloc.png' },
    { id: 'BG_2', dbfId: 2, name: 'Нейтральный', techLevel: 3, races: [] },
  ] },
  spells: { cards: [{ id: 7, name: 'Заклинание', text: '<b>Дайте</b> +1&nbsp;к атаке', tier: 2, manaCost: 1, image: 'spells/7.webp' }] },
  englishNames: { cards: [{ id: 1, name: 'Murloc Scout', slug: 'murloc-scout' }] },
  heroTiers: [{ tier: 'S', heroes: [{ name: 'Рено Джексон', image: 'https://img.example/Reno%20Jackson.png' }] }],
  accessories: { small: [{ id: 'TR_1', name: 'Малый', size: 'SMALL', image: '/trinket.webp' }], large: [{ id: 'TR_2', name: 'Большой', size: 'LARGE' }] },
}, proxied);
const byId = new Map(cards.map(card => [card.id, card]));

test('the pool keeps the classic sources, ids, names and pictures', () => {
  assert.deepEqual(cards.map(card => [card.id, card.source]), [
    ['BG_1', 'MINION'], ['BG_2', 'MINION'], ['spell-7', 'SPELL'], ['TR_1', 'ACCESSORY'], ['TR_2', 'ACCESSORY'], ['hero-рено-джексон', 'HERO'],
  ]);
  assert.equal(byId.get('BG_1')?.englishName, 'Murloc Scout');
  assert.equal(byId.get('spell-7')?.text, 'Дайте +1 к атаке');
  assert.equal(tierBuilderCardImage(byId.get('BG_1')!), proxied('https://art.example/murloc.png'));
  assert.equal(tierBuilderCardImage(byId.get('BG_2')!, '512x'), '/api/card-art?id=BG_2&locale=ruRU&size=512x');
  assert.equal(byId.get('spell-7')?.image, '/bg-legacy/spells/7.webp');
  assert.equal(byId.get('hero-рено-джексон')?.englishName, 'Reno Jackson');
  assert.equal(byId.get('TR_2')?.accessorySize, 'LARGE');
});

test('filters match the classic builder: heroes only on their own source, race and level only where they apply', () => {
  const visible = (filters = DEFAULT_TIER_BUILDER_FILTERS) => cards.filter(card => matchesTierBuilderFilters(card, filters)).map(card => card.id);
  assert.deepEqual(visible(), ['BG_1', 'BG_2', 'spell-7', 'TR_1', 'TR_2']);
  assert.deepEqual(visible(withTierBuilderSource(DEFAULT_TIER_BUILDER_FILTERS, 'HERO')), ['hero-рено-джексон']);
  assert.deepEqual(visible({ ...DEFAULT_TIER_BUILDER_FILTERS, race: 'NONE' }), ['BG_2']);
  assert.deepEqual(visible({ ...DEFAULT_TIER_BUILDER_FILTERS, level: '2' }), ['spell-7', 'TR_1', 'TR_2']);
  assert.deepEqual(visible({ ...DEFAULT_TIER_BUILDER_FILTERS, search: 'murloc' }), ['BG_1']);
  assert.deepEqual(visible({ ...withTierBuilderSource(DEFAULT_TIER_BUILDER_FILTERS, 'ACCESSORY'), accessorySize: 'LARGE' }), ['TR_2']);
  assert.deepEqual(withTierBuilderSource({ ...DEFAULT_TIER_BUILDER_FILTERS, race: 'MURLOC', level: '3' }, 'ACCESSORY'),
    { ...DEFAULT_TIER_BUILDER_FILTERS, source: 'ACCESSORY' });
});

test('drafts keep the classic shape and drop cards that left the pool', () => {
  const ids = cards.map(card => card.id);
  const placement = readTierBuilderDraft(ids, { S: ['BG_1', 'GONE', 'BG_1'], D: ['TR_2'], POOL: ['BG_2'] });
  assert.deepEqual(placement, { S: ['BG_1'], A: [], B: [], C: [], D: ['TR_2'] });
  assert.equal(placedTierBuilderCount(placement), 2);
  const saved = tierBuilderDraft(ids, placement);
  assert.deepEqual(Object.keys(saved), ['POOL', 'S', 'A', 'B', 'C', 'D']);
  assert.deepEqual(saved.POOL, ['BG_2', 'spell-7', 'TR_1', 'hero-рено-джексон']);
  assert.deepEqual(readTierBuilderDraft(ids, saved), placement);
});

test('undo after «Все в пул» walks back to the board before it', () => {
  const ids = cards.map(card => card.id);
  const history = createTierBuilderHistory(ids);
  const board = readTierBuilderDraft(ids, { S: ['BG_1'], A: ['TR_1'] });
  history.commit(board);
  history.commit({});
  history.commit({ S: ['BG_2'] });
  const cleared = history.undo();
  assert.deepEqual(cleared, { S: [], A: [], B: [], C: [], D: [] });
  // The page commits every restored placement; it must not become a new step.
  assert.equal(history.commit(cleared!), false);
  assert.deepEqual(history.undo(), board);
  assert.equal(history.commit(board), false);
  assert.equal(history.canUndo(), false);
});

test('a draft read while a source is down keeps the cards that source hid', () => {
  const saved = { S: ['BG_1', 'TR_LIVE', 'spell-9'], A: ['TR_LIVE', 7], C: ['BG_2'] };
  // Trinkets and spells failed: the pool knows only the minions.
  const outage = ['BG_1', 'BG_2'];
  const carried = unresolvedTierBuilderDraft(outage, saved);
  assert.deepEqual(carried, { S: ['TR_LIVE', 'spell-9'] });
  const placement = readTierBuilderDraft(outage, saved);
  const written = tierBuilderDraft(outage, { ...placement, A: ['BG_2'], C: [] }, carried);
  assert.deepEqual(written, { POOL: [], S: ['BG_1', 'TR_LIVE', 'spell-9'], A: ['BG_2'], B: [], C: [], D: [] });
  // Once the sources recover the hidden cards are back in their tier.
  assert.deepEqual(readTierBuilderDraft([...outage, 'TR_LIVE', 'spell-9'], written).S, ['BG_1', 'TR_LIVE', 'spell-9']);
  assert.deepEqual(unresolvedTierBuilderDraft(cards.map(card => card.id), null), {});
});
