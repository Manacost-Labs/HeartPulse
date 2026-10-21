import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { parsePatchArticle, splitStatedCard, statedChanges } from '../server/modules/patchNotes/parser.js';
import { buildPatchNotesSnapshot, createCardNameResolver, createPatchNotesService } from '../server/modules/patchNotes/service.js';
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
  'ИЗМЕНЕНИЯ БОЛЬШИХ АКСЕССУАРОВ ',
  'Наша группа Вконтакте: 1 → 2 ',
].join('\n');
const sections = [
  { level: 'h2', title: 'Изменения Hearthstone' },
  { level: 'h4', title: 'Змей ветреных вершин' },
  { level: 'h2', title: 'Изменения Полей сражений' },
];
const resolver = createCardNameResolver({
  TLC_600: { name: 'Змей ветреных вершин', playerClass: 'WARRIOR' },
  CORE_TLC_600: { name: 'Змей ветреных вершин', playerClass: 'WARRIOR' },
  A: { name: 'Двойник', playerClass: 'MAGE' },
  B: { name: 'Двойник', playerClass: 'ROGUE' },
});

test('stated cards split into cost, tier, stats and rule text', () => {
  assert.deepEqual(splitStatedCard('[Стоимость 9] [5-й уровень] 9 атаки , 9 здоровья. Рывок .'),
    { cost: 9, tier: 5, attack: 9, health: 9, text: 'Рывок.' });
  assert.deepEqual(statedChanges('1 атаки, 3 здоровья', '1 атаки, 2 здоровья'),
    [{ label: 'Здоровье', before: 3, after: 2, better: 'higher' }]);
  assert.deepEqual(statedChanges(null, 'Призывает древня.'), [{ label: 'Текст', after: 'Призывает древня.' }]);
});

test('articles become per-card changes with their notes, modes and resolved cards', () => {
  const { entries, missingBefore } = parsePatchArticle(article, sections, resolver);
  assert.equal(missingBefore, 1, 'a new value without a before value is counted, not invented');
  const serpent = entries.find(entry => entry.name === 'Змей ветреных вершин');
  assert.deepEqual(serpent, {
    id: 'constructed-змей-ветреных-вершин', name: 'Змей ветреных вершин', mode: 'constructed',
    cardId: 'TLC_600', cardClass: 'WARRIOR', subtitle: null, note: 'Родня срабатывала слишком рано.',
    changes: [{ label: 'Текст', before: 'Боевой клич: наносит 5 ед. урона. Родня: стоит на (3) меньше.',
      after: 'Боевой клич: наносит 5 ед. урона. Родня: стоит на (2) меньше.' }],
  });
  assert.deepEqual(entries.find(entry => entry.name === 'Сейсмопод')?.changes.map(change => change.label),
    ['Стоимость', 'Атака', 'Здоровье']);
  assert.deepEqual(entries.find(entry => entry.name === 'Новая карта')?.changes,
    [{ label: 'Текст', after: 'Призывает древня 2/2.' }]);
  const hyena = entries.find(entry => entry.name === 'Алчная гиена');
  assert.equal(hyena?.mode, 'battlegrounds');
  assert.equal(hyena?.cardId, null, 'Battlegrounds names are not matched against collectible cards');
  assert.deepEqual(hyena?.changes[0], { label: 'Уровень таверны', before: '5', after: '4' });
  assert.deepEqual(entries.filter(entry => entry.subtitle === 'Броня героя').map(entry => [entry.name, entry.changes]), [
    ['Рено Джексон', [{ label: 'Броня, соло', before: 16, after: 12, better: 'higher' },
      { label: 'Броня, дуэты', before: 14, after: 10, better: 'higher' }]],
    ['Инге Стальной Гимн', [{ label: 'Броня, соло', before: 17, after: 10, better: 'higher' },
      { label: 'Броня, дуэты', before: 15, after: 8, better: 'higher' }]],
  ]);
  const trinkets = entries.filter(entry => entry.name === 'Hammer of Twilight');
  assert.deepEqual(trinkets.map(entry => [entry.subtitle, entry.changes[0].after]),
    [['Малый аксессуар', 2], ['Большой аксессуар', 3]]);
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
  assert.equal(entries.some(entry => entry.name.includes('Вконтакте')), false, 'cost lines outside a trinket list are ignored');
});

test('ambiguous card names stay unresolved and reprints prefer the original id', () => {
  assert.deepEqual(resolver('змей  ветреных вершин'), { id: 'TLC_600', cardClass: 'WARRIOR' });
  assert.equal(resolver('Двойник'), null);
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

test('the page groups constructed cards by class and never labels a card without a before value as new', async () => {
  const { toPatchNotesView, normalizePatchVersion, patchNotesHref } = await import('../src/modules/patchNotes/public');
  const { entries } = parsePatchArticle(article, sections, resolver);
  const view = toPatchNotesView({ entries });
  assert.deepEqual(view.sections, [{ id: 'WARRIOR', title: 'Воин' }, { id: 'battlegrounds', title: 'Поля сражений' }]);
  const serpent = view.entries.find(entry => entry.name === 'Змей ветреных вершин');
  assert.equal(serpent?.image, '/api/card-image/TLC_600/thumb.webp');
  assert.equal(serpent?.subtitle, 'Воин');
  assert.equal(serpent?.kind, undefined, 'a stated before value lets the view derive buff, nerf or rework');
  assert.equal(view.entries.find(entry => entry.name === 'Новая карта')?.kind, 'rework');
  assert.equal(view.entries.find(entry => entry.name === 'Сейсмопод')?.section, undefined, 'an unmatched card goes to "other changes"');
  assert.equal(view.entries.find(entry => entry.name === 'Hammer of Twilight')?.subtitle, 'Малый аксессуар');
  assert.equal(normalizePatchVersion('36.6.3.253932'), '36.6.3');
  assert.equal(normalizePatchVersion('37.0'), '37.0.0');
  assert.equal(normalizePatchVersion('../etc'), '');
  assert.equal(patchNotesHref('36.6.3'), '/standard/patches/?version=36.6.3');
  assert.equal(patchNotesHref(null), '/standard/patches/');
});
