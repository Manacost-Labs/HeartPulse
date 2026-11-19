import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createPatchCardResolver } from '../server/modules/patchNotes/cardNames.js';
import { splitCardName } from '../server/modules/patchNotes/cardNames.js';
import { createCatalogCards, pickCatalogCard } from '../server/modules/patchNotes/catalogCards.js';
import { pickVersionPair } from '../server/modules/patchNotes/cardVersions.js';
import { cardFacts, diffFacts, reconcileChanges } from '../server/modules/patchNotes/versionChanges.js';
import { battlegroundNamed, collectibleNamed, createMentionFinder, sameWordStem, withMentions } from '../server/modules/patchNotes/generalMentions.js';
import { parsePatchArticle } from '../server/modules/patchNotes/parser.js';
import { createPatchNotesService } from '../server/modules/patchNotes/service.js';
import type { BattlegroundCatalogCard } from '../server/modules/patchNotes/battlegroundCatalog.js';
import type { PatchNotesDetail, PatchNotesEntry } from '../server/modules/patchNotes/contract.js';

const history = JSON.parse(readFileSync(new URL('./fixtures/card-history-snapshots-20261119.json', import.meta.url), 'utf8')) as
  Record<string, { data: { versions: unknown[] } }>;
const ORIGIN = 'https://api.kolodahearthstone.com';
const patch3702 = { from: Date.parse('2026-11-03T15:55:00+00:00'), until: null };

const bg = (id: string, ru: string, tier: number | null, cardType = 'minion'): BattlegroundCatalogCard =>
  ({ id, ru, en: '', cardType, group: null, timewarped: false, tier, renderUrl: `https://api.kolodahearthstone.com/uploads/cards/${id}.png` });
const battlegrounds = [bg('BG36_360', 'Темный парадокс', 1), bg('BG36_360t3', 'Темный парадокс', 2), bg('BG36_360t6', 'Темный парадокс', 3),
  bg('BG28_707', 'Живой азерит', 1), bg('BG33_Reflector', 'Неутомимый отражатель', 3)];

test('a name splits into the card and what the article added: an ability line, a tavern tier', () => {
  assert.deepEqual(splitCardName('Гнев К’Туна — Способность К’Туна'), { base: 'Гнев К’Туна', qualifier: 'Способность К’Туна', tier: null });
  assert.deepEqual(splitCardName('Темный парадокс (2-й уровень)'), { base: 'Темный парадокс', qualifier: '2-й уровень', tier: 2 });
  assert.deepEqual(splitCardName('Алчная гиена'), { base: 'Алчная гиена', qualifier: null, tier: null });
  assert.deepEqual(splitCardName('Хранитель — друг'), { base: 'Хранитель — друг', qualifier: null, tier: null }, 'a dash alone is not a qualifier');
});

test('Battlegrounds: "(N-й уровень)" picks the version of that tier and the entry keeps the article\'s heading', () => {
  const resolve = createPatchCardResolver({}, battlegrounds);
  const second = resolve('Темный парадокс (2-й уровень)', { mode: 'battlegrounds', subtitle: null });
  const third = resolve('Темный парадокс (3-й уровень)', { mode: 'battlegrounds', subtitle: null });
  assert.equal(second?.id, 'BG36_360t3');
  assert.equal(third?.id, 'BG36_360t6');
  assert.equal(second?.name, undefined, 'the entry keeps "Темный парадокс (2-й уровень)", the article\'s own words');
  assert.equal(resolve('Темный парадокс (9-й уровень)', { mode: 'battlegrounds', subtitle: null })?.id, 'BG36_360', 'a tier the catalog lacks falls back to the card');
  const parsed = parsePatchArticle(['Изменения Полей сражений', 'Темный парадокс (2-й уровень)', 'До изменения: [2-й уровень] 2 атаки, 6 здоровья',
    'После: [2-й уровень] 6 атаки, 2 здоровья'].join('\n'), [{ level: 'h2', title: 'Изменения Полей сражений' }], resolve);
  assert.equal(parsed.entries[0].cardId, 'BG36_360t3');
  assert.equal(parsed.entries[0].name, 'Темный парадокс (2-й уровень)');
  assert.equal(parsed.entries[0].sourceName, null);
});

const catalogRows = [
  { card_id: 'BE_013t1', name: { ru: "Гнев К'Туна" }, card_type: { slug: 'SPELL' }, class: 'NEUTRAL', images: { card: 'https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/BE_013t1.png' } },
  { card_id: 'BE_013t1e', name: { ru: "Гнев К'Туна" }, card_type: { slug: 'ENCHANTMENT' }, images: {} },
  { card_id: 'X_hero', name: { ru: "Гнев К'Туна" }, card_type: { slug: 'HERO' }, class: 'NEUTRAL', images: { card: 'https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/X_hero.png' } },
  { card_id: 'BE_013t9', name: { ru: "Гнев К'Туна, второй" }, card_type: { slug: 'SPELL' }, images: { card: 'https://art.hearthstonejson.com/x.png' } },
];

test('a catalog answer picks the exact name with a card face, an ability preferring the spell', () => {
  assert.equal(pickCatalogCard(catalogRows, 'Гнев К’Туна', true)?.id, 'BE_013t1', 'curly and straight apostrophes are one name');
  assert.equal(pickCatalogCard(catalogRows, 'Гнев К’Туна', false)?.id, 'BE_013t1');
  assert.equal(pickCatalogCard(catalogRows.slice(1, 2), 'Гнев К’Туна', true), null, 'an enchantment has no face');
  assert.equal(pickCatalogCard('nope', 'Гнев К’Туна', true), null);
});

const entry = (name: string, over: Partial<PatchNotesEntry> = {}): PatchNotesEntry => ({
  id: name, name, sourceName: null, mode: 'constructed', cardId: null, cardClass: null, cardType: null, renderUrl: null, artwork: null,
  beforeRenderUrl: null, afterRenderUrl: null, format: null, archetypes: [], history: [], subtitle: null, changes: [], note: null, ...over,
});
const detail = (entries: PatchNotesEntry[]): PatchNotesDetail => ({
  version: '37.0.2', build: '37.0.2.1', title: 'Патч 37.0.2', publishedAt: '2026-11-03T15:55:00+00:00', sourceUrl: null, officialUrl: null,
  changeCount: entries.length, summary: null, entries, missingBefore: 0, pictureSections: [], generalChanges: [], meta: null,
});

test('cards the dictionary lacks are found in the catalog: the ability line becomes the subtitle, the format stays unknown, each name is asked once', async () => {
  const asked: string[] = [];
  const catalog = createCatalogCards({
    baseUrl: `${ORIGIN}/api/v1`,
    fetchJson: async url => {
      asked.push(decodeURIComponent(url));
      if (url.includes('%D0%9D%D0%B5%D1%82')) throw new Error('down');
      return { data: catalogRows };
    },
  });
  const patch = detail([
    entry('Гнев К’Туна — Способность К’Туна', { id: 'a' }), entry('Гнев К’Туна — Способность К’Туна', { id: 'b' }),
    entry('Нет такой карты', { id: 'c' }), entry('Возрождение', { id: 'd', cardId: 'FP1_025', format: 'wild' }),
    entry('Дуэльная', { id: 'e', mode: 'battlegrounds' }),
  ]);
  await catalog.load([patch]);
  const [filled] = catalog.fill([patch]);
  const [a, , c, d, e] = filled.entries;
  assert.equal(a.cardId, 'BE_013t1');
  assert.equal(a.name, 'Гнев К’Туна', 'the article\'s spelling of the name');
  assert.equal(a.subtitle, 'Способность К’Туна');
  assert.equal(a.format, null);
  assert.equal(a.renderUrl, 'https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/BE_013t1.png');
  assert.equal(c.cardId, null, 'a name the catalog does not know stays text');
  assert.equal(d.cardId, 'FP1_025');
  assert.equal(e.cardId, null, 'Battlegrounds names are the Battlegrounds catalog\'s business');
  assert.equal(asked.filter(url => url.includes("К'Туна")).length, 1, 'one name, one request, with a straight apostrophe');
  await catalog.load([patch]);
  assert.equal(asked.filter(url => url.includes("К'Туна")).length, 1, 'the answer is kept');
});

test('snapshot facts: Constructed states mana, attack, health, durability, armor and text; Battlegrounds tier, attack and health', () => {
  assert.deepEqual(cardFacts({ mana_cost: 2, attack: 3, health: 4, durability: null, armor: null, text_ru: '<b>Похищение жизни</b>' }, false),
    { cost: 2, attack: 3, health: 4, durability: undefined, armor: undefined, text: 'похищение жизни' });
  assert.deepEqual(cardFacts({ tavern_tier: 4, attack: 6, health: 3 }, true), { tier: 4, attack: 6, health: 3 });
  assert.equal(cardFacts(null, false), null);
});

test('plates come from the two versions: "Рыцарь-гибрид" is Health 3 → 4 without Text, "Матриарх" is Mana 9 → 10', () => {
  const knight = pickVersionPair(history.BE_285.data.versions, 'image_url', patch3702, ORIGIN);
  assert.deepEqual(knight?.diff, { changes: [{ label: 'Здоровье', before: 3, after: 4, better: 'higher' }], text: false });
  // The article states the rune cost and stats as one text change; the versions say the text itself did not change.
  const stated = [{ label: 'Текст', before: '[2 руны крови] 3 атаки, 3 здоровья', after: '[3 руны крови] 3 атаки, 4 здоровья' }];
  assert.deepEqual(reconcileChanges(stated, knight!.diff!, false), [{ label: 'Здоровье', before: 3, after: 4, better: 'higher' }]);

  const mother = pickVersionPair(history.BE_036.data.versions, 'image_url', patch3702, ORIGIN);
  assert.deepEqual(reconcileChanges([{ label: 'Стоимость', before: 9, after: 10, better: 'lower' }], mother!.diff!, false),
    [{ label: 'Стоимость', before: 9, after: 10, better: 'lower' }]);
});

test('plates of Battlegrounds cards: numbers from the versions, the article\'s text and gold kept', () => {
  const guard = pickVersionPair(history.BG36_362.data.versions, 'card_image', patch3702, ORIGIN);
  assert.deepEqual(guard?.diff, { changes: [{ label: 'Атака', before: 5, after: 6, better: 'higher' }], text: null });
  const article = [{ label: 'Атака', before: 4, after: 6, better: 'higher' as const }, { label: 'Текст', before: 'а', after: 'б' },
    { label: 'Стоимость', before: 1, after: 2, better: 'lower' as const }];
  assert.deepEqual(reconcileChanges(article, guard!.diff!, true), [
    { label: 'Атака', before: 5, after: 6, better: 'higher' }, { label: 'Текст', before: 'а', after: 'б' },
    { label: 'Стоимость', before: 1, after: 2, better: 'lower' },
  ]);
});

test('a text that really changed is the plate "Текст"; versions that differ in nothing leave the article\'s changes', () => {
  const diff = diffFacts({ cost: 1, text: 'уничтожает существо' }, { cost: 1, text: 'уничтожает нелегендарное существо' });
  assert.deepEqual(diff, { changes: [], text: true });
  assert.deepEqual(reconcileChanges([{ label: 'Текст', before: 'a', after: 'b' }], diff, false), [{ label: 'Текст', before: 'a', after: 'b' }]);
  assert.deepEqual(reconcileChanges([], diff, false), [{ label: 'Текст' }], 'no stated text: the plate still says the text changed');
  const same = diffFacts({ cost: 1, text: 'a' }, { cost: 1, text: 'a' });
  const stated = [{ label: 'Атака', before: 1, after: 2, better: 'higher' as const }];
  assert.deepEqual(reconcileChanges(stated, same, false), stated);
});

test('word endings: a name matches its cases word by word', () => {
  assert.ok(sameWordStem('азеритов', 'азерит'));
  assert.ok(sameWordStem('живых', 'живой'));
  assert.ok(sameWordStem('отражателя', 'отражатель'));
  assert.ok(!sameWordStem('дар', 'даров'), 'short words agree exactly');
  assert.ok(!sameWordStem('мурлок', 'муравей'));
});

test('general changes name cards: "Неутомимый отражатель", "Живых азеритов"; plain words are left alone', () => {
  const find = createMentionFinder(battlegroundNamed(battlegrounds));
  const first = 'Неутомимый отражатель больше не может выпасть с Неприметностью.';
  assert.deepEqual(find(first, 0).map(mark => [first.slice(mark.start, mark.end), mark.cardId, mark.name]), [['Неутомимый отражатель', 'BG33_Reflector', 'Неутомимый отражатель']]);
  const second = 'Анимации нескольких Живых азеритов в игре теперь проигрываются как одна.';
  const [mark] = find(second, 1);
  assert.deepEqual([second.slice(mark.start, mark.end), mark.cardId, mark.name, mark.line], ['Живых азеритов', 'BG28_707', 'Живой азерит', 1]);
  assert.equal(mark.renderUrl, 'https://api.kolodahearthstone.com/uploads/cards/BG28_707.png');
  assert.deepEqual(find('Начиная с 7 хода, в раскопке будут как минимум 2 существа вашего типа существ.', 0), []);
  // A single word needs to be long and written like a name; a lower-case "паради" is not "Парадокс".
  const single = createMentionFinder([{ id: 'X', name: 'Парадокс', renderUrl: null }, { id: 'Y', name: 'Дар', renderUrl: null }]);
  assert.deepEqual(single('есть парадокс и дар', 0), []);
  assert.equal(single('Парадокс изменён', 0)[0]?.cardId, 'X');
  assert.equal(single('нажмите «парадокс»', 0)[0]?.cardId, 'X', 'a quoted name counts');
});

test('collectible names keep the original print, and the marks reach the mode\'s general changes only', () => {
  const named = collectibleNamed({ CORE_A: { name: 'Двойник' }, A: { name: 'Двойник' }, Z: { name: 'Зверь' } });
  assert.deepEqual(named.map(card => card.id).sort(), ['A', 'Z']);
  const patch = { ...detail([]), generalChanges: [
    { mode: 'battlegrounds' as const, lines: ['Живых азеритов больше нет.'] },
    { mode: 'constructed' as const, lines: ['Живых азеритов больше нет.'] },
  ] };
  const [result] = withMentions([patch], { battlegrounds: createMentionFinder(battlegroundNamed(battlegrounds)), collectible: createMentionFinder(named) });
  assert.equal(result.generalChanges[0].marks?.[0]?.cardId, 'BG28_707');
  assert.equal(result.generalChanges[1].marks, undefined, 'Constructed lines look in the collectible dictionary, which has no such card');
});

test('a slow catalog never holds an answer back: it goes out within the bound, the reads go on, the next answer has the cards', async () => {
  const asked: string[] = [];
  const service = createPatchNotesService({
    fetchJson: async () => ({ patches: [] }), patchesUrl: 'x', ttlMs: 1000, loadCardNames: async () => ({}),
    cardHistoryBaseUrl: `${ORIGIN}/api/v1`,
    fetchCardHistory: async url => {
      asked.push(url);
      if (!url.includes('/card-catalog?')) throw Object.assign(new Error('not found'), { status: 404 });
      await new Promise(resolve => setTimeout(resolve, 2_600));
      return { data: catalogRows };
    },
  });
  const patch = detail([entry('Гнев К’Туна — Способность К’Туна', { id: 'a' })]);
  const snapshot = { patches: [patch], updatedAt: '2026-11-19T00:00:00.000Z' };
  const started = Date.now();
  const [first] = await service.withCardVersions(snapshot, [patch]);
  const took = Date.now() - started;
  assert.ok(took < 2_500, `the answer waited ${took} ms, longer than the bound`);
  assert.equal(first.entries[0].cardId, null, 'without the catalog\'s answer the entry keeps its article name');
  assert.equal(service.incomplete(), true, 'an answer built before the reads finished is marked incomplete');
  await new Promise(resolve => setTimeout(resolve, 900));
  assert.equal(service.incomplete(), false);
  const [second] = await service.withCardVersions(snapshot, [patch]);
  assert.equal(second.entries[0].cardId, 'BE_013t1');
  assert.equal(asked.filter(url => url.includes('/card-catalog?')).length, 1, 'the background read was joined, not repeated');
});
