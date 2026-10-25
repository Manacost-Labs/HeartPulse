import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { parseRadarReport, radarPeriodLabel, type RadarReport } from '../server/modules/radar/contract.js';
import { RADAR_BACKTEST_FIXTURE, RADAR_FIXTURE } from '../server/modules/radar/fixture.js';
import { createRadarRouter } from '../server/modules/radar/routes.js';
import { createRadarService } from '../server/modules/radar/service.js';
import { createRadarLocalizer } from '../server/modules/radar/localize.js';
import type { RadarReport as PageRadarReport } from '../src/modules/radar/model/types.js';
import {
  DEFAULT_RADAR_FILTERS, filterRadarCandidates, formatRadarCount, formatRadarDay, formatRadarDelta, formatRadarTime, isRadarReport,
  radarClassOptions, radarConfidenceLevel, radarEntityImage, radarTopCandidates, radarTrendDelta, radarWhyLine,
} from '../src/modules/radar/model/radarView.js';

// RADAR_FIXTURE — ответ hs-data-api в его формате ({ data, meta }).
const upstream = () => JSON.parse(JSON.stringify(RADAR_FIXTURE)) as { data: Record<string, any> };
// Настоящий прогон схемы 2: 17 кандидатов на нерф, 15 на бафф.
const NERFS = 17;
const LABELS: Record<string, string> = { 'Zee Shaman': 'Зи Шаман', 'Dragon Warrior': 'Воин на драконах' };
const namer = (name: string) => ({ slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label: LABELS[name] ?? name });

test('the radar contract maps the hs-data-api result to the page model', () => {
  const raw = upstream();
  raw.data.patch = { version: '37.0.0.254477', title: '37.0 Patch Notes', url: 'https://example.test/' };
  const report = parseRadarReport(raw, { nameArchetype: namer });
  // Типы страницы повторяют контракт сервера: присваивание в обе стороны ломает `npm run lint` при расхождении.
  const forPage: PageRadarReport = report;
  const fromPage: RadarReport = forPage;
  assert.equal(fromPage.demo, false);
  assert.equal(report.generatedAt, '2026-10-25T12:41:05.000Z', 'dates leave as ISO');
  assert.deepEqual(report.patch, { version: '37.0.0', href: '/standard/patches/?version=37.0.0' });
  assert.equal(parseRadarReport(upstream()).patch, null, 'a run without a patch has no patch link');
  assert.deepEqual(report.window, { from: '2026-10-18T00:00:00.000Z', to: '2026-10-25T12:38:13.000Z' });
  assert.deepEqual([report.nerfs.length, report.buffs.length], [NERFS, 15]);
  assert.deepEqual(report.nerfs.slice(0, 4).map(candidate => candidate.confidence), [62, 50, 42, 42], 'by confidence');
  const [ritual] = report.nerfs;
  assert.deepEqual(ritual.entity, {
    id: 'BE_085', dbfId: 129793, name: 'Ритуал призыва', nameEn: 'Ritual of Summoning', classKey: 'warlock', href: '/standard/cards/standard/BE_085/',
  });
  assert.equal(ritual.previousConfidence, 70);
  assert.equal(ritual.stats.rankLabel, 'Легенда');
  assert.deepEqual(ritual.stats.trend.map(point => point.label), ['Сутки', '3 дня', 'Неделя', '2 недели', 'С патча']);
  assert.equal(ritual.stats.trend[0].winrate, 56.47, 'card periods read deck winrate');
  assert.deepEqual([ritual.social.sentiment, ritual.social.stance, ritual.social.mentions, ritual.social.reddit], ['negative', 'wants_nerf', 7, 6]);
  assert.deepEqual(ritual.precedents[0], {
    id: 'precedent:35.2.2.241135:END_033', patch: '35.2.2', date: '2026-04-29T00:00:00.000Z', name: 'Прозорливый дракозмей',
    classKey: 'neutral', direction: 'nerf', changes: ['Атака: 6 → 5'], summary: null, setAgeDays: 211,
    before: { archetype: 'Воин на драконах', winrate: 56.22, popularity: 11.22 }, after: { archetype: 'Воин на драконах', winrate: 55.03, popularity: 8.37 },
    similarity: ['похожий винрейт', 'похожая популярность'], cited: true,
    cardHref: '/standard/cards/wild/END_033/', patchHref: '/standard/patches/?version=35.2.2',
  });
  assert.deepEqual(ritual.forecast.predictedChanges.map(change => [change.field, change.before, change.after, change.probability]),
    [['cost', 2, 3, 55], ['health', 5, 4, 20], ['text', null, null, 10]], 'variants from the most probable');
  assert.deepEqual([ritual.forecast.calibration, ritual.forecast.trend, ritual.forecast.confidenceHistory.map(point => point.confidence)],
    [{ rate: 22, hits: 2, samples: 9 }, { status: 'down', delta: -8 }, [75, 70, 62]]);
  assert.equal(ritual.forecast.keyNumbers.length, 4);
  assert.deepEqual(report.timing && [report.timing.within7, report.timing.within14, report.timing.daysSinceLastPatch], [50, 90, 13]);
  assert.deepEqual(report.changes && [report.changes.added.length, report.changes.added[0], report.changes.fallen[0]], [5,
    { side: 'nerfs', kind: 'archetype', name: 'Zoolock', confidence: 50, delta: null },
    { side: 'buffs', kind: 'class', name: 'Друид', confidence: 28, delta: -20 }], 'five per group, archetypes through the namer');
  assert.equal(parseRadarReport(raw).backtest, null, 'no backtest answer, no accuracy block');
  const archetype = report.nerfs.find(candidate => candidate.kind === 'archetype');
  assert.deepEqual(archetype?.entity, {
    id: 'zoolock', dbfId: null, name: 'Zoolock', nameEn: null, classKey: 'warlock', href: '/standard/archetypes/standard/zoolock/',
  });
  const russianRun = upstream();
  russianRun.data.nerfs.find((item: { kind: string }) => item.kind === 'archetype').name = 'Зоолок';
  assert.equal(parseRadarReport(russianRun, { nameArchetype: namer }).nerfs.find(item => item.kind === 'archetype')?.entity.name, 'Зоолок',
    'the Russian name from hs-data-api is used when the site has no translation');
  assert.deepEqual(archetype?.stats.trend.map(point => point.label), ['Сутки', 'Неделя', 'Дополнение', 'Баны']);
  const druid = report.buffs.find(candidate => candidate.kind === 'class');
  assert.deepEqual([druid?.entity.classKey, druid?.entity.href, druid?.stats.trend], ['druid', null, []]);
  assert.deepEqual([report.history?.balancePatches, report.history?.patterns.length, report.history?.from],
    [52, 8, '2023-12-08T00:00:00.000Z']);
  assert.deepEqual(parseRadarReport(raw, { backtest: RADAR_BACKTEST_FIXTURE }).backtest, {
    patches: 8,
    nerf: [
      { top: 3, hits: 7, actual: 22, predicted: 24, precision: 29, recall: 32 }, { top: 5, hits: 11, actual: 22, predicted: 40, precision: 28, recall: 50 },
      { top: 10, hits: 13, actual: 22, predicted: 80, precision: 16, recall: 59 },
    ],
    buff: [
      { top: 3, hits: 0, actual: 11, predicted: 24, precision: 0, recall: 0 }, { top: 5, hits: 0, actual: 11, predicted: 40, precision: 0, recall: 0 },
      { top: 10, hits: 2, actual: 11, predicted: 80, precision: 3, recall: 18 },
    ],
    basis: 'statistical', text: null, caveat: null,
  });
  const accuracy = parseRadarReport({ data: { ...raw.data, accuracy: {
    basis: 'model', text: 'Радар проверен на 8 прошлых балансных патчах.', caveat: 'Оценка сверху.',
    statistical: { patches: 8, 'nerf@5': { precision: 0.28, recall: 0.5, hits: 11, predicted: 40, actual: 22 } },
    model: { patches: 6, 'nerf@5': { precision: 0.4, recall: 0.6, hits: 9, predicted: 30, actual: 15 }, 'buff@10': { hits: 1, actual: 0 } },
  } } }, { backtest: RADAR_BACKTEST_FIXTURE }).backtest;
  assert.deepEqual(accuracy, {
    patches: 6, nerf: [{ top: 5, hits: 9, actual: 15, predicted: 30, precision: 40, recall: 60 }], buff: [],
    basis: 'model', text: 'Радар проверен на 8 прошлых балансных патчах.', caveat: 'Оценка сверху.',
  }, 'the run\'s own accuracy block wins over /backtest and names its basis');
  assert.equal(parseRadarReport({ ...raw, data: { ...raw.data, history: null } }).history, null, 'runs without history have no section');
});

test('the radar contract reads precedents and Blizzard patterns leniently', () => {
  const raw = upstream();
  raw.data.history = {
    generatedAt: '2026-10-25T00:00:00Z', coverage: { from: '2024-03-19', to: '2026-10-12', statsFrom: '2025-01-01' },
    balancePatches: 24, summary: 'Обзор истории патчей.', historyUrl: 'x', patternsUrl: 'y',
    patterns: [
      'Новые карты дополнения редко меняют в первые две недели',
      { title: 'Нерф через стоимость', detail: 'Чаще всего дорожает ключевая карта колоды.' },
      { detail: 'без заголовка' },
    ],
  };
  raw.data.nerfs[0].precedents = [
    { id: 'p1', patch: '36.2.2.250000', name: 'Карта А', class: 'MAGE', direction: 'nerf', citedByModel: false, setAgeDays: 12,
      changes: [{ field: 'cost', before: 2, after: 3 }, { field: 'durability', before: 3, after: 2 }],
      textBefore: 'Наносит 3 ед. урона.', textAfter: 'Наносит 2 ед. урона.',
      similarity: ['same_class', 'similar_winrate', 'cited', 'unknown_code', 'своя причина'],
      preStats: { archetype: 'Zee Shaman', winrate: 58.4, popularity: 12 }, postStats: { archetype: null, winrate: 52.1, popularity: null } },
    { id: 'p2', patch: '36.4.2', name: 'Карта Б', cardId: '../evil', direction: 'teleport', citedByModel: true },
    { id: 'p3', patch: 'latest', name: 'Без версии' },
    { id: 'p2', patch: '36.4.2', name: 'Повтор' },
  ];
  const report = parseRadarReport(raw, { nameArchetype: namer });
  assert.deepEqual(report.history, {
    summary: 'Обзор истории патчей.', balancePatches: 24, from: '2024-03-19T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z',
    patterns: [
      { title: 'Новые карты дополнения редко меняют в первые две недели', text: null, count: null },
      { title: 'Нерф через стоимость', text: 'Чаще всего дорожает ключевая карта колоды.', count: null },
    ],
  });
  const [cited, other] = report.nerfs[0].precedents;
  assert.equal(report.nerfs[0].precedents.length, 2, 'a precedent without a version and a repeated id are dropped');
  assert.deepEqual([cited.id, cited.direction, cited.cardHref], ['p2', 'neutral', null], 'cited first; a strange card id gets no link');
  assert.deepEqual([other.patch, other.setAgeDays, other.changes, other.similarity, other.before, other.after], [
    '36.2.2', 12, ['Стоимость: 2 → 3', 'Прочность: 3 → 2', 'Текст: «Наносит 3 ед. урона.» → «Наносит 2 ед. урона.»'],
    ['тот же класс', 'похожий винрейт', 'своя причина'],
    { archetype: 'Зи Шаман', winrate: 58.4, popularity: 12 }, { archetype: null, winrate: 52.1, popularity: null },
  ]);
});

test('the radar contract drops broken records and foreign links', () => {
  const raw = upstream();
  const [first] = raw.data.nerfs;
  raw.data.nerfs.push(
    { ...first, ref: 'card:NO_NAME', name: '' },
    { ...first, ref: 'spell:X', kind: 'spell' },
    { ...first, confidence: 12 },
  );
  first.confidence = 140;
  first.class = 'Demon Hunter';
  first.dates.firstFlaggedAt = '2026-10-25 06:00';
  first.social.topPosts = [
    { platform: 'reddit', url: 'https://evil.example/login', author: 'a', score: 9999, excerpt: 'Чужой домен под видом Reddit' },
    { platform: 'reddit', url: 'javascript:alert(1)', author: 'b', score: 1, excerpt: 'Скрипт' },
    { platform: 'x', url: 'http://x.com/plain', author: 'c', score: 1, excerpt: 'Без TLS' },
    { platform: 'mastodon', url: 'https://mastodon.social/@a/1', author: 'd', score: 1, excerpt: 'Чужая сеть' },
    { platform: 'x', url: 'https://twitter.com/a/status/1', author: 'e', score: 5, excerpt: 'Старый домен X' },
    { platform: 'reddit', url: 'https://old.reddit.com/r/hearthstone/comments/1', author: 'f', score: 3, excerpt: 'Поддомен Reddit' },
    { platform: 'reddit', url: 'https://old.reddit.com/r/hearthstone/comments/1', author: 'f', score: 3, excerpt: 'Повтор' },
  ];
  const report = parseRadarReport(raw);
  assert.equal(report.nerfs.length, NERFS, 'a nameless record, an unknown kind and a duplicate ref are dropped');
  assert.equal(report.nerfs[0].id, 'card:BE_085');
  assert.equal(report.nerfs[0].confidence, 100, 'confidence is clamped to 0..100');
  assert.equal(report.nerfs[0].entity.classKey, 'demonhunter');
  assert.match(report.nerfs[0].firstSeenAt ?? '', /^2026-10-25T\d\d:00:00\.000Z$/, 'a lenient date leaves as ISO');
  assert.deepEqual(report.nerfs[0].social.posts.map(post => post.author), ['e', 'f'], 'only https links on the platform\'s own hosts, once');
});

test('the page gets Russian names and Russian posts only', () => {
  const archetypes = { zoolock: 'Зоолок', shredslock: 'Чернокнижник на обрывках', "c'thun warlock": 'Чернокнижник на К\'Туне', aggro: 'Aggro' };
  const cards = [
    { card_id: 'BE_085', name: { en: 'Ritual of Summoning', ru: 'Ритуал призыва' } }, { card_id: 'OG_280', name: { en: "C'Thun", ru: "К'Тун" } },
    { card_id: 'SHRED', name: { en: 'Shred', ru: 'Шред' } }, { card_id: 'CS2_028', name: { en: 'Blizzard', ru: 'Снежная буря' } },
    { card_id: 'NOT_IN_RUN', name: { en: 'Charge', ru: 'Рывок' } },
  ];
  const localize = createRadarLocalizer({ archetypes, cards, cardIds: new Set(['BE_085', 'OG_280', 'SHRED', 'CS2_028']) });
  assert.equal(localize('Zoolock и Shredslock держат 63%, а C\u2019Thun Warlock 60%; ritual of summoning — ключ.'),
    'Зоолок и Чернокнижник на обрывках держат 63%, а Чернокнижник на К\'Туне 60%; Ритуал призыва — ключ.');
  assert.equal(localize('Ритуал призыва (Ritual of Summoning) и Зоолок (Zoolock) — пара.'), 'Ритуал призыва и Зоолок — пара.',
    'a Russian name followed by its English original is not repeated');
  assert.equal(localize('Aggro Shredder и Zoolocks не трогаются'), 'Aggro Shredder и Zoolocks не трогаются',
    'only whole names, and no translation that is still Latin');
  // Регрессия: компания «Blizzard» стала картой мага «Снежная буря» по всему радару.
  assert.equal(localize('Blizzard чаще всего повышает стоимость; I think Blizzard missed some text.'),
    'Blizzard чаще всего повышает стоимость; I think Blizzard missed some text.', 'company and service names stay as they are');
  assert.equal(localize('Charge даёт рывок'), 'Charge даёт рывок', 'a card the run does not name is never replaced');
  assert.equal(localize('В Даймонд 4–Легенда и на Diamond 4-1 винрейт выше, на Legend ниже.'),
    'В Алмаз 4–Легенда и на Алмаз 4-1 винрейт выше, на Легенда ниже.', 'ranks in Russian');
  const raw = upstream();
  raw.data.summary = 'Zoolock доминирует.';
  raw.data.history.patterns = [{ title: 'Нерф Zoolock', detail: 'Ritual of Summoning дорожает' }];
  const [first] = raw.data.nerfs;
  first.verdict = 'Ritual of Summoning питает Zoolock.';
  first.social.topPosts = [
    { platform: 'reddit', url: 'https://reddit.com/r/hearthstone/comments/1', author: 'a', score: 5, title: 'Nerf it', excerpt: 'English only' },
    { platform: 'reddit', url: 'https://reddit.com/r/hearthstone/comments/2', author: 'b', score: 4, title: 'Nerf it', excerpt: 'English',
      titleRu: 'Ослабьте его', textRu: 'Полный перевод поста.' },
    { platform: 'x', url: 'https://x.com/a/status/3', author: 'c', score: 3, excerpt: 'Hi', translation: { text: 'Привет' } },
    { platform: 'reddit', url: 'https://reddit.com/r/hearthstone/comments/4', author: 'd', score: 2,
      textRu: 'Моя колода:\n\nAAECAa35AwLb4Aft+QcO0J4G15cHhJkHoq0HpK0HqK0H\n\nУдачи!' },
  ];
  let named: ReadonlySet<string> = new Set();
  const report = parseRadarReport(raw, { localizeFor: cardIds => { named = cardIds; return localize; } });
  assert.ok(named.has('BE_085') && named.has('END_033'), 'cards of candidates and of precedents are the ones replaced');
  assert.equal(named.has('CS2_028'), false);
  assert.equal(report.summary, 'Зоолок доминирует.');
  assert.equal(report.nerfs[0].verdict, 'Ритуал призыва питает Зоолок.');
  assert.deepEqual(report.history?.patterns[0], { title: 'Нерф Зоолок', text: 'Ритуал призыва дорожает', count: null });
  assert.deepEqual(report.nerfs[0].social.posts.map(post => [post.title, post.text]),
    [[null, null], ['Ослабьте его', 'Полный перевод поста.'], [null, 'Привет'], [null, 'Моя колода:\n\nУдачи!']],
    'no English text reaches the page, and deck codes are cut out of posts');
});

test('the radar contract rejects a response without its frame', () => {
  const frame = (patch: Record<string, unknown>) => ({ data: { ...upstream().data, ...patch } });
  assert.throws(() => parseRadarReport(null), /response must be an object/);
  assert.throws(() => parseRadarReport(frame({ generatedAt: 'вчера' })), /generatedAt/);
  assert.throws(() => parseRadarReport(frame({ summary: '  ' })), /summary/);
  assert.throws(() => parseRadarReport(frame({ buffs: null })), /buffs must be an array/);
  assert.throws(() => parseRadarReport(frame({ schemaVersion: 0 })), /schemaVersion/);
  assert.throws(() => parseRadarReport(frame({ schemaVersion: '2' })), /schemaVersion/);
  assert.throws(() => parseRadarReport(frame({ format: 'wild' })), /format/);
  const minimal = parseRadarReport({ generatedAt: '2026-10-25T00:00:00Z', summary: 'Тихо.', nerfs: [], buffs: [] });
  assert.deepEqual([minimal.model, minimal.patch, minimal.window], ['неизвестна', null, null]);
  assert.equal(parseRadarReport(frame({ schemaVersion: 3, keyNumbers: ['новое поле'] })).nerfs.length, NERFS,
    'later schema versions only add fields and keep working');
  assert.deepEqual(['patch_36.6.3', 'black_empire_ban', 'black_empire', 'past_30_days'].map(radarPeriodLabel),
    ['Патч 36.6.3', 'Баны', 'Дополнение', '30 дней']);
});

test('/api/radar serves the cached snapshot, waits between failed reads and marks the demo fixture', async () => {
  let clock = 0; let reads = 0; let logged = 0; let payload: unknown = upstream(); let down = false;
  const service = createRadarService({
    fetchJson: async url => {
      reads += 1;
      assert.equal(url, 'https://example.test/v1/constructed/balance-radar?format=standard');
      if (down) throw new Error('balance radar HTTP 503');
      return payload;
    },
    radarUrl: 'https://example.test/v1/constructed/balance-radar?format=standard', fixture: false, ttlMs: 1000, retryMs: 500, now: () => clock,
    onError: () => { logged += 1; },
  });
  down = true;
  await assert.rejects(service.load(), /503/);
  await assert.rejects(service.load(), /503/);
  assert.equal(reads, 1, 'before the first snapshot a failure is remembered for retryMs');
  assert.equal(logged, 1, 'one log line per failed read, not per request');
  clock = 600; down = false;
  assert.equal((await service.load()).nerfs.length, NERFS);
  await service.load();
  assert.equal(reads, 2, 'a fresh snapshot is not read again');
  clock = 2000; payload = { broken: true };
  assert.equal((await service.load()).nerfs.length, NERFS, 'an expired snapshot is served while it refreshes');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 3);
  assert.equal((await service.load()).nerfs.length, NERFS, 'an invalid answer keeps the last good snapshot');
  assert.equal(reads, 3, 'a failed refresh waits for the retry delay');

  const demoService = createRadarService({
    fetchJson: async () => { throw new Error('unused'); }, radarUrl: 'x', fixture: true, ttlMs: 1,
    loadNaming: async () => ({ nameArchetype: namer }),
  });
  const app = express()
    .use('/live', createRadarRouter({ load: service.load }))
    .use('/demo', createRadarRouter({ load: demoService.load }))
    .use('/down', createRadarRouter({ load: createRadarService({ fetchJson: async () => { throw new Error('404'); }, radarUrl: 'x', fixture: false, ttlMs: 1 }).load }));
  const server = app.listen(0);
  try {
    const { port } = server.address() as { port: number };
    const get = (path: string) => fetch(`http://127.0.0.1:${port}${path}`);
    const live = await get('/live/radar');
    assert.equal(live.status, 200);
    assert.equal(live.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=120', 'a new run shows within minutes');
    assert.equal((await live.json()).demo, false);
    const demo = await get('/demo/radar');
    assert.equal(demo.headers.get('cache-control'), 'no-store', 'the demo is never cached at the edge');
    const demoBody = await demo.json();
    assert.equal(demoBody.demo, true);
    assert.ok(demoBody.nerfs.some((candidate: { entity: { id: string } }) => candidate.entity.id === 'c-thun-dh'), 'archetypes get site slugs');
    assert.equal(demoBody.backtest.patches, 8, 'the demo carries its backtest');
    const failed = await get('/down/radar');
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), { error: 'Радар временно недоступен' });
  } finally {
    server.close();
  }
});

test('the radar view model filters candidates and formats dates without Intl clocks', () => {
  const report = parseRadarReport(upstream(), { demo: true, nameArchetype: namer });
  assert.equal(isRadarReport(report), true);
  assert.equal(isRadarReport({ error: 'Радар временно недоступен' }), false);
  assert.equal(filterRadarCandidates(report.nerfs, DEFAULT_RADAR_FILTERS).length, NERFS);
  assert.deepEqual(filterRadarCandidates(report.nerfs, { classKey: 'demonhunter', kind: 'archetype', minConfidence: 0 })
    .map(candidate => candidate.entity.id), ['c-thun-dh']);
  assert.deepEqual(filterRadarCandidates(report.nerfs, { classKey: 'warlock', kind: 'card', minConfidence: 50 })
    .map(candidate => candidate.entity.id), ['BE_085']);
  assert.deepEqual(filterRadarCandidates(report.nerfs, { classKey: 'warlock', kind: 'card', minConfidence: 0 })
    .slice(0, 2).map(candidate => candidate.entity.id), ['BE_085', 'BE_726']);
  assert.deepEqual(filterRadarCandidates(report.buffs, { classKey: 'all', kind: 'class', minConfidence: 0 })
    .map(candidate => candidate.entity.classKey), ['druid', 'mage']);
  assert.deepEqual(filterRadarCandidates(report.buffs, { classKey: 'all', kind: 'all', minConfidence: 75 }), []);
  assert.deepEqual(radarClassOptions(report), ['warrior', 'druid', 'priest', 'mage', 'demonhunter', 'rogue', 'deathknight', 'warlock', 'shaman', 'neutral'],
    'classes of both sections, in Russian order, neutral last');
  assert.deepEqual([75, 74, 50, 49].map(radarConfidenceLevel), ['high', 'medium', 'medium', 'low']);
  assert.equal(radarEntityImage(report.nerfs[0]), '/api/card-image/BE_085/thumb.webp');
  assert.equal(radarEntityImage(report.buffs.find(candidate => candidate.kind === 'class')!), '/class_icon/ui/druid-64.webp');
  assert.equal(formatRadarTime('2026-10-25T10:12:15.000Z'), '25 октября, 13:12 МСК');
  assert.equal(report.nerfs[0].precedents[0].before?.archetype, 'Воин на драконах', 'precedent archetypes get site labels');
  assert.equal(formatRadarDay('2026-12-31T22:30:00.000Z'), '1 января', 'Moscow is UTC+3');
  assert.equal(formatRadarCount(64641), '64 641');
  assert.deepEqual(radarTopCandidates(report).map(({ section, candidate }) => [section, candidate.confidence]),
    [['nerfs', 62], ['nerfs', 50], ['nerfs', 42]], 'three top candidates of both sections');
  const [ritual] = report.nerfs;
  assert.equal(radarWhyLine({ ...ritual, headline: 'Ритуал призыва — главная карта Чернокнижника' }), 'Главная карта Чернокнижника',
    'the why line does not repeat the name');
  assert.equal(radarWhyLine({ ...ritual, headline: 'Ритуал призыва: 21% колод' }), '21% колод');
  assert.equal(radarWhyLine({ ...ritual, headline: 'Самая частая карта' }), 'Самая частая карта');
  assert.equal(radarTrendDelta(58.9, 58.2), 0.7);
  assert.equal(radarTrendDelta(null, 58.2), null);
  assert.deepEqual([0.7, -1.25, 0].map(formatRadarDelta), ['+0,7', '−1,3', '±0']);
});
