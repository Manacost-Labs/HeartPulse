import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { parsePatchArticle, splitStatedCard, statedChanges } from '../server/modules/patchNotes/parser.js';
import {
  buildPatchNotesSnapshot, createCardNameResolver, createPatchCardResolver, createPatchNotesService, dropForeignArticleBuilds,
} from '../server/modules/patchNotes/service.js';
import { encode } from '@firestone-hs/deckstrings';
import { buildPatchMetaIndex } from '../server/modules/patchNotes/metaImpact.js';
import { createArtworkLookup, createDbfLookup, withHistory } from '../server/modules/patchNotes/enrichment.js';
import {
  createBattlegroundCatalogLoader, createBattlegroundNameResolver, loadBattlegroundCatalog, type BattlegroundCatalogCard,
} from '../server/modules/patchNotes/battlegroundCatalog.js';
import { createPatchNotesRouter } from '../server/modules/patchNotes/routes.js';
import { shortPatchVersion } from '../server/modules/patchNotes/contract.js';

// Shapes copied from the stored hs-manacost.ru articles of 36.6.3 and 36.4.2.
const article = [
  'Обновление Hearthstone 36.6.3 , выход которого состоялся 1 октября.',
  'Изменения Hearthstone ',
  'Комментарий разработчиков: Мы думаем, что мету можно назвать здоровой.',
  'Змей ветреных вершин ',
  'Комментарий разработчиков: Родня срабатывала слишком рано.',
  'До изменения: Боевой клич: наносит 5 ед. урона. Родня: стоит на (3) меньше. ',
  'После : Боевой клич: наносит 5 ед. урона. Родня: стоит на (2) меньше . ',
  'Сейсмопод ',
  'До изменения: [Стоимость 9] 9 атаки, 9 здоровья ',
  'После : [Стоимость 8] 8 атаки, 8 здоровья ',
  'Новая карта ',
  'После: Призывает древня 2/2. ',
  'Изменения Полей сражений ',
  'Броня следующих героев была уменьшена : ',
  'Герой Обычная игра Дуэты Рено Джексон 16 → 12 14 → 10 Инге Стальной Гимн 17 → 10 15 → 8 ',
  'Алчная гиена ',
  'До изменения: [5-й уровень] 5 атаки, 6 здоровья ',
  'После : [4-й уровень] 4 атаки , 6 здоровья ',
  'ИЗМЕНЕНИЯ СТОИМОСТИ МАЛЫХ АКСЕССУАРОВ ',
  'Стоимость следующих малых аксессуаров была увеличена : ',
  'Нажмите, чтобы открыть ',
  'Hammer of Twilight: 1 → 2 ',
  'ИЗМЕНЕНИЯ СТОИМОСТИ БОЛЬШИХ АКСЕССУАРОВ ',
  'Hammer of Twilight: 1 → 3 ',
  'ИЗМЕНЕНИЯ СУЩЕСТВ ',
  'ИЗМЕНЕНИЯ БОЛЬШИХ АКСЕССУАРОВ ',
  'ОБЩИЕ ИЗМЕНЕНИЯ ',
  'Аберрации больше не встречаются в каждом матче. ',
  'Наша группа Вконтакте: 1 → 2 ',
].join('\n');
const sections = [
  { level: 'h2', title: 'Изменения Hearthstone' },
  { level: 'h4', title: 'Змей ветреных вершин' },
  { level: 'h2', title: 'Изменения Полей сражений' },
  { level: 'h4', title: 'ИЗМЕНЕНИЯ СТОИМОСТИ МАЛЫХ АКСЕССУАРОВ' },
  { level: 'h4', title: 'ИЗМЕНЕНИЯ СТОИМОСТИ БОЛЬШИХ АКСЕССУАРОВ' },
  { level: 'h4', title: 'ИЗМЕНЕНИЯ СУЩЕСТВ' },
  { level: 'h4', title: 'ИЗМЕНЕНИЯ БОЛЬШИХ АКСЕССУАРОВ' },
  { level: 'h4', title: 'ОБЩИЕ ИЗМЕНЕНИЯ' },
];
const battlegroundCards: BattlegroundCatalogCard[] = [
  { id: 'BG36_MagicItem_403', ru: 'Молот Сумерек', en: 'Hammer of Twilight', cardType: 'trinket', group: 'lesser', timewarped: false,
    renderUrl: 'https://art.hearthstonejson.com/v1/bgs/latest/ruRU/512x/BG36_MagicItem_403.png' },
  { id: 'BG36_MagicItem_403t', ru: 'Молот Сумерек', en: 'Hammer of Twilight', cardType: 'trinket', group: 'greater', timewarped: false,
    renderUrl: null },
  { id: 'BG34_Giant_009', ru: 'Алчная гиена', en: 'Greedy Hyena', cardType: 'minion', group: null, timewarped: true, renderUrl: null },
  { id: 'BG21_009', ru: 'Алчная гиена', en: 'Greedy Hyena', cardType: 'minion', group: null, timewarped: false, renderUrl: null },
  { id: 'TB_BaconShop_HERO_41', ru: 'Рено Джексон', en: 'Reno Jackson', cardType: 'hero', group: null, timewarped: false, renderUrl: null },
];
const resolver = createPatchCardResolver({
  TLC_600: { name: 'Змей ветреных вершин', playerClass: 'WARRIOR', type: 'MINION' },
  CORE_TLC_600: { name: 'Змей ветреных вершин', playerClass: 'WARRIOR', type: 'MINION' },
  A: { name: 'Двойник', playerClass: 'MAGE' },
  B: { name: 'Двойник', playerClass: 'ROGUE' },
}, battlegroundCards);

test('stated cards split into cost, tier, stats and rule text', () => {
  assert.deepEqual(splitStatedCard('[Стоимость 9] [5-й уровень] 9 атаки , 9 здоровья. Рывок .'),
    { cost: 9, tier: 5, attack: 9, health: 9, text: 'Рывок.' });
  assert.deepEqual(statedChanges('1 атаки, 3 здоровья', '1 атаки, 2 здоровья'),
    [{ label: 'Здоровье', before: 3, after: 2, better: 'higher' }]);
  assert.deepEqual(statedChanges(null, 'Призывает древня.'), [{ label: 'Текст', after: 'Призывает древня.' }]);
});

test('articles become per-card changes with their notes, modes and resolved cards', () => {
  const { entries, missingBefore, pictureSections, generalChanges } = parsePatchArticle(article, sections, resolver);
  assert.equal(missingBefore, 1, 'a new value without a before value is counted, not invented');
  const serpent = entries.find(entry => entry.name === 'Змей ветреных вершин');
  assert.deepEqual(serpent, {
    id: 'constructed-змей-ветреных-вершин', name: 'Змей ветреных вершин', sourceName: null, mode: 'constructed',
    cardId: 'TLC_600', cardClass: 'WARRIOR', cardType: 'minion', renderUrl: null, artwork: null, format: null, archetypes: [], history: [],
    subtitle: null,
    note: 'Родня срабатывала слишком рано.',
    changes: [{ label: 'Текст', before: 'Боевой клич: наносит 5 ед. урона. Родня: стоит на (3) меньше.',
      after: 'Боевой клич: наносит 5 ед. урона. Родня: стоит на (2) меньше.' }],
  });
  assert.deepEqual(entries.find(entry => entry.name === 'Сейсмопод')?.changes.map(change => change.label),
    ['Стоимость', 'Атака', 'Здоровье']);
  assert.deepEqual(entries.find(entry => entry.name === 'Новая карта')?.changes,
    [{ label: 'Текст', after: 'Призывает древня 2/2.' }]);
  const hyena = entries.find(entry => entry.name === 'Алчная гиена');
  assert.equal(hyena?.mode, 'battlegrounds');
  assert.equal(hyena?.cardId, 'BG21_009', 'a regular Battlegrounds card wins over its Timewarped copy');
  assert.equal(hyena?.sourceName, null);
  assert.deepEqual(hyena?.changes[0], { label: 'Уровень таверны', before: '5', after: '4' });
  assert.deepEqual(entries.filter(entry => entry.subtitle === 'Броня героя').map(entry => [entry.name, entry.cardId, entry.changes]), [
    ['Рено Джексон', 'TB_BaconShop_HERO_41', [{ label: 'Броня, соло', before: 16, after: 12, better: 'higher' },
      { label: 'Броня, дуэты', before: 14, after: 10, better: 'higher' }]],
    ['Инге Стальной Гимн', null, [{ label: 'Броня, соло', before: 17, after: 10, better: 'higher' },
      { label: 'Броня, дуэты', before: 15, after: 8, better: 'higher' }]],
  ]);
  const trinkets = entries.filter(entry => entry.sourceName === 'Hammer of Twilight');
  assert.deepEqual(trinkets.map(entry => [entry.name, entry.subtitle, entry.cardId, entry.cardType, entry.changes[0].after]), [
    ['Молот Сумерек', 'Малый аксессуар', 'BG36_MagicItem_403', 'trinket', 2],
    ['Молот Сумерек', 'Большой аксессуар', 'BG36_MagicItem_403t', 'trinket', 3],
  ], 'English trinket names take the Russian catalog name; the list heading picks lesser or greater');
  assert.equal(trinkets[0].renderUrl, 'https://art.hearthstonejson.com/v1/bgs/latest/ruRU/512x/BG36_MagicItem_403.png');
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
  assert.equal(entries.some(entry => entry.name.includes('Вконтакте')), false, 'cost lines outside a trinket list are ignored');
  assert.deepEqual(pictureSections, [
    { mode: 'battlegrounds', title: 'ИЗМЕНЕНИЯ СУЩЕСТВ' }, { mode: 'battlegrounds', title: 'ИЗМЕНЕНИЯ БОЛЬШИХ АКСЕССУАРОВ' },
  ], 'change headings with nothing under them are the article\'s picture-only changes');
  assert.deepEqual(generalChanges, [{ mode: 'battlegrounds', lines: ['Аберрации больше не встречаются в каждом матче.'] }]);
});

test('older article shapes: "До изменений", hero-power owners, stated new costs and side modes', () => {
  const older = [
    'Изменения карт Hearthstone',
    'Демоническая динамика',
    'До изменений: [Стоимость 3]',
    'После: [Стоимость 2]',
    'Изменения Дуэлей',
    'Выслеживание ящеров',
    '(Бранн Бронзобород)',
    'До изменения: Вы раскапываете зверя.',
    'После : Вы раскапываете зверя вашего класса .',
    'Поля сражений',
    'Загадочный куб',
    'Новая стоимость: 0',
    'Кровоточащее сердце',
    'Новая стоимость: 6',
    'До изменения: После того как погибает 8 ваших существ.',
    'После : После того как погибает 9 ваших существ.',
  ].join('\n');
  const { entries, missingBefore } = parsePatchArticle(older, [
    { level: 'h2', title: 'Изменения карт Hearthstone' }, { level: 'h2', title: 'Изменения Дуэлей' }, { level: 'h3', title: 'Поля сражений' },
  ], resolver);
  assert.deepEqual(entries.map(entry => [entry.name, entry.mode, entry.subtitle, entry.changes.map(change => change.label)]), [
    ['Демоническая динамика', 'constructed', null, ['Стоимость']],
    ['Выслеживание ящеров', 'other', 'Дуэли · Бранн Бронзобород', ['Текст']],
    ['Загадочный куб', 'battlegrounds', null, ['Стоимость']],
    ['Кровоточащее сердце', 'battlegrounds', null, ['Стоимость', 'Текст']],
  ]);
  assert.equal(missingBefore, 1, 'only the cost without any before statement lacks a before value');
});

test('Battlegrounds catalog: paged lists, Russian and English names, last good copy on failure', async () => {
  const requested: string[] = [];
  let down = false;
  const fetchJson = async (url: string) => {
    requested.push(url);
    if (down) throw new Error('down');
    if (url.startsWith('https://kolodahs.test/trinkets')) {
      const page = Number(new URL(url).searchParams.get('page'));
      return { data: [{ card_id: `T${page}`, name: { ru: `Аксессуар ${page}`, en: `Trinket ${page}` }, group: { slug: 'lesser' },
        images: { card: page === 1 ? 'https://art.hearthstonejson.com/v1/bgs/latest/ruRU/512x/T1.png' : 'javascript:alert(1)' } }],
      pagination: { has_next: page < 2 } };
    }
    if (url.startsWith('https://kolodahs.test/cards')) {
      return { data: [{ card_id: 'S1', name: { ru: 'Банан', en: 'Banana' }, card_type: { slug: 'spell' } }, { card_id: '', name: {} }] };
    }
    return { data: [] };
  };
  const cards = await loadBattlegroundCatalog(fetchJson, 'https://kolodahs.test');
  assert.deepEqual(cards.map(card => [card.id, card.cardType, card.group, card.renderUrl]), [
    ['S1', 'spell', null, null],
    ['T1', 'trinket', 'lesser', 'https://art.hearthstonejson.com/v1/bgs/latest/ruRU/512x/T1.png'],
    ['T2', 'trinket', 'lesser', null],
  ]);
  assert.ok(requested.includes('https://kolodahs.test/trinkets?per_page=200&page=2'));
  const resolve = createBattlegroundNameResolver(cards);
  assert.equal(resolve('trinket  2', { mode: 'battlegrounds', subtitle: null })?.name, 'Аксессуар 2');
  assert.equal(resolve('Неизвестно', { mode: 'battlegrounds', subtitle: null }), null);

  let clock = 0;
  const load = createBattlegroundCatalogLoader({ fetchJson, baseUrl: 'https://kolodahs.test', ttlMs: 1000, now: () => clock });
  assert.equal((await load()).length, 3);
  const calls = requested.length;
  await load();
  assert.equal(requested.length, calls, 'a fresh copy is reused');
  clock = 2000; down = true;
  assert.equal((await load()).length, 3, 'a failed reload keeps the last good copy');
});

test('Constructed entries carry today\'s format from the Standard catalog, reprints included', () => {
  const snapshot = buildPatchNotesSnapshot(rows, resolver, 'x', { standard: new Set(['CORE_TLC_600']) });
  assert.equal(snapshot.patches.find(patch => patch.version === '36.6.3')?.entries.find(entry => entry.cardId === 'TLC_600')?.format, 'standard');
  const wild = buildPatchNotesSnapshot(rows, resolver, 'x', { standard: new Set(['OTHER']) });
  assert.equal(wild.patches.find(patch => patch.version === '36.6.3')?.entries.find(entry => entry.cardId === 'TLC_600')?.format, 'wild');
  assert.equal(buildPatchNotesSnapshot(rows, resolver, 'x').patches[1].entries.every(entry => entry.format === null), true,
    'no Standard catalog, no format');
});

test('Constructed entries carry the wiki full art of the catalog, reprints included; Battlegrounds entries do not', () => {
  const art = (url: unknown, width: unknown = 2048, height: unknown = 1536) => ({ images: { art: url, art_metadata: { width, height } } });
  const artwork = createArtworkLookup([
    { card_id: 'CORE_TLC_600', ...art('https://api.kolodahearthstone.com/uploads/constructed-related-wiki-full-art/TLC_600.jpg') },
    { card_id: 'SMALL', ...art('https://api.kolodahearthstone.com/small.jpg', 'x', 0) },
    { card_id: 'UNSAFE', ...art('javascript:alert(1)') },
  ]);
  assert.deepEqual(artwork('TLC_600'), {
    url: 'https://api.kolodahearthstone.com/uploads/constructed-related-wiki-full-art/TLC_600.jpg', width: 2048, height: 1536,
  }, 'the original id finds the art of its CORE_ reprint');
  assert.deepEqual(artwork('SMALL'), { url: 'https://api.kolodahearthstone.com/small.jpg', width: null, height: null },
    'unknown dimensions stay unknown');
  assert.equal(artwork('UNSAFE'), null, 'only http(s) art reaches the page');
  const snapshot = buildPatchNotesSnapshot(rows, resolver, 'x', { artwork });
  const entries = snapshot.patches.find(patch => patch.version === '36.6.3')?.entries ?? [];
  assert.equal(entries.find(entry => entry.cardId === 'TLC_600')?.artwork?.width, 2048);
  assert.equal(entries.filter(entry => entry.mode === 'battlegrounds').every(entry => entry.artwork === null), true);
  assert.equal(buildPatchNotesSnapshot(rows, resolver, 'x').patches[1].entries.every(entry => entry.artwork === null), true,
    'no catalog, no art');
});

test('a slow art catalog never holds the patch snapshot back; its art joins once it arrives', async () => {
  let release: (cards: Record<string, unknown>[]) => void = () => undefined;
  const service = createPatchNotesService({
    fetchJson: async () => ({ patches: rows }), patchesUrl: 'x', ttlMs: 60_000,
    loadCardNames: async () => ({ TLC_600: { name: 'Змей ветреных вершин', playerClass: 'WARRIOR' } }),
    loadCardArtwork: () => new Promise(resolve => { release = resolve; }),
  });
  const serpent = (snapshot: Awaited<ReturnType<typeof service.load>>) => snapshot.patches
    .flatMap(patch => patch.entries).find(entry => entry.cardId === 'TLC_600');
  assert.equal(serpent(await service.load())?.artwork, null, 'the first snapshot does not wait for the art');
  release([{ card_id: 'TLC_600', images: { art: 'https://api.kolodahearthstone.com/uploads/a.jpg', art_metadata: { width: 1600, height: 900 } } }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(serpent(await service.load())?.artwork?.width, 1600, 'the same snapshot gains the art without a refetch');
});

test('meta impact: archetypes whose builds play any print of a changed card, missing formats reported', () => {
  const deck = (dbfs: number[]) => encode({ cards: dbfs.map(dbf => [dbf, 2]), heroes: [7], format: 2 });
  const meta = buildPatchMetaIndex([{
    format: 'standard', period: 'black_empire', updatedAt: '2026-10-21T10:00:00Z', items: [
      { slug: 'dragon-warrior', archetypeLabel: 'Воин на драконах', classKey: 'warrior', popularity: 4.2,
        builds: [{ deckCode: deck([100, 1]) }, { deckCode: deck([200, 1]) }, { deckCode: 'broken' }] },
      { slug: 'control-warrior', archetypeLabel: 'Контроль Воин', classKey: 'warrior', popularity: 9,
        builds: [{ deckCode: deck([1]) }, { deckCode: deck([2]) }] },
      { slug: 'zoolock', archetypeLabel: 'Зоолок', classKey: 'warlock', popularity: 1.3, builds: [{ deckCode: deck([3]) }] },
    ],
  }], ['wild']);
  const dbfs = createDbfLookup({
    TLC_600: { name: 'Змей ветреных вершин', playerClass: 'WARRIOR', dbf: 100 },
    CORE_TLC_600: { name: 'Змей ветреных вершин', playerClass: 'WARRIOR', dbf: 200 },
    OTHER: { name: 'Змей ветреных вершин', playerClass: 'MAGE', dbf: 300 },
  });
  const snapshot = buildPatchNotesSnapshot(rows, resolver, 'x', { meta, dbfs });
  const serpent = snapshot.patches.find(patch => patch.version === '36.6.3')?.entries.find(entry => entry.cardId === 'TLC_600');
  assert.deepEqual(serpent?.archetypes.map(use => [use.slug, use.decks, use.totalDecks]), [['dragon-warrior', 2, 3]],
    'both prints count; a broken deck code is skipped, not fatal');
  assert.deepEqual(snapshot.patches[1].meta, { period: 'black_empire', updatedAt: '2026-10-21T10:00:00Z', formats: ['standard'], missing: ['wild'] });
  assert.equal(snapshot.patches.find(patch => patch.version === '36.6.3')?.entries.find(entry => entry.mode === 'battlegrounds')?.archetypes.length, 0);
});

test('history links a card to earlier patches that changed it, newest first', () => {
  const patch = (version: string, ids: string[]) => ({
    version, build: version, title: version, publishedAt: null, sourceUrl: null, officialUrl: null, changeCount: ids.length,
    summary: null, missingBefore: 0, pictureSections: [], generalChanges: [], meta: null,
    entries: ids.map(id => ({ id: `e-${id}-${version}`, name: id, sourceName: null, mode: 'constructed' as const, cardId: id,
      cardClass: null, cardType: null, renderUrl: null, artwork: null, format: null, archetypes: [], history: [], subtitle: null, changes: [], note: null })),
  });
  const [newest, middle, oldest] = withHistory([patch('3.0.0', ['A', 'B']), patch('2.0.0', ['A']), patch('1.0.0', ['A', 'B'])]);
  assert.deepEqual(newest.entries[0].history.map(item => [item.version, item.entryId]), [['2.0.0', 'e-A-2.0.0'], ['1.0.0', 'e-A-1.0.0']]);
  assert.deepEqual(newest.entries[1].history.map(item => item.version), ['1.0.0']);
  assert.deepEqual(middle.entries[0].history.map(item => item.version), ['1.0.0']);
  assert.deepEqual(oldest.entries[0].history, []);
});

test('pre-release builds matched to a modern article are dropped from the archive', () => {
  const shared = { match_state: 'matched', source_url: 'https://hs-manacost.ru/28-2-3/', title: 'Обновление 28.2.3 уже в игре' };
  assert.deepEqual(dropForeignArticleBuilds([
    { ...shared, version: '28.2.3.191554' }, { ...shared, version: '2.3.0.8108' },
    { match_state: 'matched', source_url: 'https://hs-manacost.ru/x/', title: '(Дополнено 12.11) Без версии', version: '24.6.2.155409' },
    { match_state: 'matched', source_url: 'https://hs-manacost.ru/x/', title: '(Дополнено 12.11) Без версии', version: '4.6.0.1' },
  ]).map(row => row.version), ['28.2.3.191554', '24.6.2.155409']);
});

test('ambiguous card names stay unresolved and reprints prefer the original id', () => {
  const collectible = createCardNameResolver({
    TLC_600: { name: 'Змей ветреных вершин', playerClass: 'WARRIOR', type: 'MINION' },
    CORE_TLC_600: { name: 'Змей ветреных вершин', playerClass: 'WARRIOR', type: 'MINION' },
    A: { name: 'Двойник', playerClass: 'MAGE' },
    B: { name: 'Двойник', playerClass: 'ROGUE' },
  });
  assert.deepEqual(collectible('змей  ветреных вершин'), { id: 'TLC_600', cardClass: 'WARRIOR', cardType: 'minion' });
  assert.equal(collectible('Двойник'), null);
  assert.equal(shortPatchVersion('Patch 36.6.3.253932'), '36.6.3');
});

const rows = [
  { version: '35.6.2.244584', hs_manacost_version: '35.6.2', title: 'Старая сборка', match_state: 'matched',
    official_published_at: '2025-11-01T10:00:00Z', content_text: 'Карта\nДо изменения: 1 атаки, 1 здоровья\nПосле: 2 атаки, 1 здоровья' },
  { version: '35.6.2.245096', hs_manacost_version: '35.6.2', title: 'Новая сборка', match_state: 'matched',
    official_published_at: '2025-11-01T10:00:00Z', content_text: 'Карта\nДо изменения: 1 атаки, 1 здоровья\nПосле: 2 атаки, 1 здоровья' },
  { version: '36.6.3.253932', hs_manacost_version: '36.6.3', title: 'Обновление 36.6.3', match_state: 'matched',
    official_published_at: '2026-10-01T15:55:00Z', source_url: 'https://hs-manacost.ru/36-6-3/', content_text: article, sections },
  { version: '37.0.0.254477', title: 'Без статьи', match_state: 'missing_manacost', official_published_at: '2026-10-12T16:55:00Z',
    official_url: 'javascript:alert(1)' },
];

test('the snapshot keeps the newest build of each version, newest patch first', () => {
  const snapshot = buildPatchNotesSnapshot(rows, resolver, '2026-10-21T00:00:00.000Z');
  assert.deepEqual(snapshot.patches.map(patch => [patch.version, patch.build, patch.changeCount > 0]), [
    ['37.0.0', '37.0.0.254477', false], ['36.6.3', '36.6.3.253932', true], ['35.6.2', '35.6.2.245096', true],
  ]);
  assert.equal(snapshot.patches[0].officialUrl, null, 'only http(s) links reach the page');
  assert.equal(snapshot.patches[1].sourceUrl, 'https://hs-manacost.ru/36-6-3/');
});

test('routes serve the archive, the latest patch with changes and one version; failures keep the last snapshot', async () => {
  let clock = 0; let fail = false; let reads = 0;
  const service = createPatchNotesService({
    fetchJson: async () => { reads += 1; if (fail) throw new Error('down'); return { patches: rows }; },
    patchesUrl: 'https://example.test/api/patches', ttlMs: 1000, now: () => clock,
    loadCardNames: async () => ({ TLC_600: { name: 'Змей ветреных вершин', playerClass: 'WARRIOR' } }),
  });
  const app = express().use('/api', createPatchNotesRouter({ load: service.load }));
  const server = app.listen(0);
  try {
    const { port } = server.address() as { port: number };
    const get = (path: string) => fetch(`http://127.0.0.1:${port}/api${path}`);
    const archive = await get('/patch-notes');
    assert.equal(archive.headers.get('cache-control'), 'public, max-age=600, stale-while-revalidate=1800');
    assert.deepEqual((await archive.json()).patches.map((patch: { version: string }) => patch.version), ['36.6.3', '35.6.2']);
    const latest = await (await get('/patch-notes/latest')).json();
    assert.equal(latest.version, '36.6.3');
    assert.equal(latest.entries.find((entry: { cardId: string | null }) => entry.cardId)?.cardId, 'TLC_600');
    assert.equal((await (await get('/patch-notes/36.6.3.253932')).json()).title, 'Обновление 36.6.3');
    assert.equal((await get('/patch-notes/1.2.3')).status, 404);
    assert.equal((await get('/patch-notes/latest-and-greatest')).status, 400);
    clock = 5000; fail = true;
    assert.equal((await get('/patch-notes')).status, 200, 'an expired snapshot is served while it refreshes');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 2);
    assert.equal((await get('/patch-notes')).status, 200);
    assert.equal(reads, 2, 'a failed refresh waits for the retry delay instead of refetching per request');
    clock = 5000 + 61_000; fail = false;
    await get('/patch-notes');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 3);
  } finally {
    server.close();
  }
  const empty = createPatchNotesService({ fetchJson: async () => { throw new Error('down'); }, patchesUrl: 'x',
    ttlMs: 1000, loadCardNames: async () => ({}) });
  const failing = express().use('/api', createPatchNotesRouter({ load: empty.load }));
  const second = failing.listen(0);
  try {
    const { port } = second.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/api/patch-notes`);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    second.close();
  }
});

test('the page groups cards by mode, class or type and derives kinds only from directed numbers', async () => {
  const {
    toPatchView, filterPatchView, patchGroupOptions, patchHighlights, normalizePatchVersion, patchNotesHref, sentenceCase,
    patchGroupKinds,
  } = await import('../src/modules/patchNotes/public');
  const { entries } = parsePatchArticle(article, sections, resolver);
  const view = toPatchView({ entries: entries.map(entry => entry.cardId === 'TLC_600' ? { ...entry, format: 'standard' as const } : entry) });
  assert.deepEqual(view.sections.map(section => [section.id, section.count]), [['standard', 1], ['constructed', 2], ['battlegrounds', 5]],
    'cards of unknown format stay under "Стандарт и Вольный"');
  assert.deepEqual(view.groups.map(group => group.title),
    ['Воин', 'Карты не из коллекции', 'Существа', 'Броня героя', 'Малый аксессуар', 'Большой аксессуар']);
  const serpent = view.groups.flatMap(group => group.entries).find(entry => entry.name === 'Змей ветреных вершин');
  assert.equal(serpent?.thumb, '/api/card-image/TLC_600/thumb.webp');
  assert.equal(serpent?.typeLabel, 'Существо · Воин');
  assert.equal(serpent?.kind, 'rework', 'a text change carries no direction');
  assert.equal(serpent?.hasText, true);
  assert.equal(serpent?.cardUrl, '/standard/cards/standard/TLC_600/');
  assert.equal(serpent?.anchor, 'card-constructed-змей-ветреных-вершин');
  assert.deepEqual(view.groups.map(group => group.icon).slice(0, 3), [{ classKey: 'warrior' }, { cardType: null }, { cardType: 'minion' }]);
  assert.deepEqual(patchGroupKinds(view.groups.find(group => group.title === 'Броня героя') ?? view.groups[0]), { buff: 0, nerf: 2, rework: 0 });
  const use = (slug: string, popularity: number) => ({ format: 'standard' as const, slug, name: slug, classKey: 'warrior', popularity, decks: 1, totalDecks: 2 });
  const withMeta = toPatchView({ entries: entries.map(entry => (entry.cardId === 'TLC_600'
    ? { ...entry, archetypes: [use('control', 2), use('dragon', 9)], history: [{ version: '36.4.2', entryId: 'x', publishedAt: null }] }
    : entry)) });
  assert.deepEqual(withMeta.groups[0].entries[0].archetypes.map(use => use.href),
    ['/standard/archetypes/standard/control/', '/standard/archetypes/standard/dragon/']);
  assert.equal(withMeta.groups[0].entries[0].history[0].href, '/standard/patches/?version=36.4.2#card-x');
  assert.deepEqual(patchHighlights(view), [], 'eight changes are read whole; highlights would only repeat them');
  const longer = toPatchView({ entries: [...view.groups.flatMap(group => group.entries).map(card => entries.find(entry => entry.id === card.id)!),
    ...entries.filter(entry => entry.mode === 'battlegrounds').map(entry => ({ ...entry, id: `${entry.id}-again` }))] });
  assert.deepEqual(patchHighlights(longer).map(card => card.name), ['Рено Джексон', 'Рено Джексон', 'Молот Сумерек', 'Молот Сумерек'],
    'four at most; short sections (one Standard card) are read whole below; then the largest number moves first');
  const cards = view.groups.flatMap(group => group.entries);
  const hammer = cards.find(entry => entry.cardId === 'BG36_MagicItem_403');
  assert.deepEqual([hammer?.name, hammer?.sourceName, hammer?.art, hammer?.kind, hammer?.changes[0].direction],
    ['Молот Сумерек', 'Hammer of Twilight', 'square', 'nerf', 'nerf'], 'a higher trinket cost is a nerf');
  assert.equal(cards.find(entry => entry.name === 'Рено Джексон')?.art, 'hero');
  assert.equal(cards.find(entry => entry.name === 'Алчная гиена')?.kind, 'nerf', 'stats went down; the tier move has no direction');
  assert.equal(cards.find(entry => entry.name === 'Новая карта')?.kind, 'rework');
  assert.deepEqual(view.kinds, { buff: 0, nerf: 5, rework: 3 }, 'mixed cost and stat moves (Сейсмопод) are a rework');

  const nerfs = filterPatchView(view, { section: 'battlegrounds', kind: 'nerf', group: 'all', query: '' });
  assert.equal(nerfs.flatMap(group => group.entries).length, 5);
  const found = filterPatchView(view, { section: 'all', kind: 'all', group: 'all', query: 'hammer  ТВИЛАЙТ' });
  assert.deepEqual(found.flatMap(group => group.entries).map(entry => entry.id), [],
    'every word must match; nothing is spelt "твилайт"');
  assert.equal(filterPatchView(view, { section: 'all', kind: 'all', group: 'all', query: 'twilight' })
    .flatMap(group => group.entries).length, 2, 'English names are searchable');
  assert.equal(filterPatchView(view, { section: 'all', kind: 'all', group: 'all', query: 'стоит на (2)' }).length, 1,
    'change text is searchable');
  assert.deepEqual(patchGroupOptions(view, 'constructed').map(option => [option.title, option.count]), [['Карты не из коллекции', 2]]);
  assert.equal(sentenceCase('ИЗМЕНЕНИЯ ТЕМНЫХ ДАРОВ'), 'Изменения темных даров');
  assert.equal(sentenceCase('Изменения Арены'), 'Изменения Арены');
  assert.equal(normalizePatchVersion('36.6.3.253932'), '36.6.3');
  assert.equal(normalizePatchVersion('37.0'), '37.0.0');
  assert.equal(normalizePatchVersion('../etc'), '');
  assert.equal(patchNotesHref('36.6.3'), '/standard/patches/?version=36.6.3');
  assert.equal(patchNotesHref(null), '/standard/patches/');
});

test('presentation: the expansion of a version, the hero lead, wide art and the archive by expansion', async () => {
  const { toPatchView, patchExpansionCode, patchHeroLead, patchFeaturedArtwork, patchArchiveByExpansion, patchKindShares, patchHeadline } =
    await import('../src/modules/patchNotes/public');
  assert.equal(patchHeadline('Обновление 36.6.3: балансные изменения Стандарта и Полей сражений'), 'Балансные изменения Стандарта и Полей сражений');
  assert.equal(patchHeadline('Обновление 36.4.2 уже в игре: баланс Стандарта, Арены и Полей сражений'), 'Баланс Стандарта, Арены и Полей сражений');
  assert.equal(patchHeadline('Обновление 30.2 уже в игре! Аксессуары на Полях сражений и новый сезон Арены'), 'Аксессуары на Полях сражений и новый сезон Арены');
  assert.equal(patchHeadline('Обновление 29.2: Дуэты на Полях сражений, баланс Стандарта — уже в игре'), 'Дуэты на Полях сражений, баланс Стандарта');
  assert.equal(patchHeadline('(Дополнено 12.11) Обновление 24.6.2: баланс Полей сражений и Арены'), 'Баланс Полей сражений и Арены');
  assert.equal(patchHeadline('Обновление 37.0: «Власть Темной Империи», предрелизная потасовка'), '«Власть Темной Империи», предрелизная потасовка');
  assert.equal(patchHeadline('Обновление 18.2 — уже в игре!'), null, 'a title that only names the version adds nothing to the version');
  assert.equal(patchHeadline('Обновление 37.0'), null);
  assert.equal(patchHeadline('Большой патч баланса'), 'Большой патч баланса', 'a title in another shape is kept whole');
  assert.equal(patchExpansionCode('35.0.3'), 'CATACLYSM');
  assert.equal(patchExpansionCode('37.0.0'), 'BE');
  assert.equal(patchExpansionCode('19.0.0'), null, 'a cycle the archive does not name stays unknown');
  const { entries } = parsePatchArticle(article, sections, resolver);
  const wide = { url: 'https://api.kolodahearthstone.com/uploads/a.jpg', width: 2048, height: 1536 };
  const view = toPatchView({ entries: entries.map(entry => (entry.cardId === 'TLC_600' ? { ...entry, format: 'standard' as const, artwork: wide } : entry)) });
  assert.deepEqual(patchHeroLead(view), { mode: 'battlegrounds' }, 'five Battlegrounds changes outweigh three Constructed ones');
  const constructed = toPatchView({ entries: entries.filter(entry => entry.mode !== 'battlegrounds') });
  assert.deepEqual(patchHeroLead(constructed), { classKey: 'warrior' }, 'the class with most changes leads; unmatched cards have none');
  assert.deepEqual(patchHeroLead(toPatchView({ entries: [] })), null);
  const cards = view.groups.flatMap(group => group.entries);
  assert.equal(patchFeaturedArtwork(cards)?.card.cardId, 'TLC_600');
  assert.equal(patchFeaturedArtwork(cards.map(card => ({ ...card, artwork: card.artwork && { ...card.artwork, width: 600 } }))), null,
    'art narrower than a featured plate is left out');
  const summary = (version: string, publishedAt: string) => ({ version, build: version, title: version, publishedAt, sourceUrl: null, officialUrl: null, changeCount: 3 });
  assert.deepEqual(patchArchiveByExpansion([summary('36.0.3', '2026-07-21'), summary('35.6.2', '2026-06-11'), summary('35.0.3', '2026-04-02'),
    summary('19.2.0', '2021-01-01')]).map(group => [group.code, group.patches.map(patch => patch.version)]),
  [['ESCAPEFROM_VIOLET_HOLD', ['36.0.3']], ['CATACLYSM', ['35.6.2', '35.0.3']], [null, ['19.2.0']]]);
  assert.deepEqual(patchKindShares({ buff: 1, nerf: 3, rework: 0 }), { buff: 25, nerf: 75, rework: 0 });
  assert.deepEqual(patchKindShares({ buff: 0, nerf: 0, rework: 0 }), { buff: 0, nerf: 0, rework: 0 });
});

test('meta flow: changed cards to the archetypes whose builds play them, weighted by those builds', async () => {
  const { toPatchView, patchMetaFlow } = await import('../src/modules/patchNotes/public');
  const { entries } = parsePatchArticle(article, sections, resolver);
  const use = (slug: string, popularity: number, decks: number) => ({
    format: 'standard' as const, slug, name: `Архетип ${slug}`, classKey: 'warrior', popularity, decks, totalDecks: 12,
  });
  const view = toPatchView({ entries: entries.map(entry => (entry.cardId === 'TLC_600'
    ? { ...entry, format: 'standard' as const, archetypes: [use('dragon', 4.2, 12), use('control', 1.1, 3), use('rare', 0.1, 1)] }
    : entry)) });
  const flow = patchMetaFlow(view, { archetypes: 2 });
  assert.deepEqual(flow.links.map(link => [link.source, link.target, link.value]), [
    ['card:card-constructed-змей-ветреных-вершин', 'archetype:standard:dragon', 12],
    ['card:card-constructed-змей-ветреных-вершин', 'archetype:standard:control', 3],
  ], 'the most popular archetypes only; the flow is the number of their builds with the card');
  assert.deepEqual(flow.nodes.map(node => [node.kind, node.label, node.href]), [
    ['card', 'Змей ветреных вершин', '/standard/cards/standard/TLC_600/'],
    ['archetype', 'Архетип dragon', '/standard/archetypes/standard/dragon/'],
    ['archetype', 'Архетип control', '/standard/archetypes/standard/control/'],
  ]);
  assert.equal(flow.nodes[0].cardKind, 'rework');
  assert.deepEqual(patchMetaFlow(toPatchView({ entries })), { nodes: [], links: [] }, 'no meta, no flow');
});
