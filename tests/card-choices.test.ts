import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { createCardChoicesRouter, projectCardChoices } from '../server/modules/constructedCards/public.js';
import {
  cardChoiceEmptyText, cardChoiceKindOf, cardChoiceMeanWinrate, cardChoiceTitle, cardChoiceWinrateTone, formatChoicePercent,
  type CardChoicesData,
} from '../src/modules/constructedCards/model/cardChoices.js';

// Live hs-data-api answer for Illidari Studies at Legend (2026-10-25), trimmed.
const ILLIDARI = JSON.parse(readFileSync(new URL('./fixtures/card-choices-illidari-studies-20261025.json', import.meta.url), 'utf8'));

// Projection: only rendered fields, Russian names, HSReplay links only.
const projected = projectCardChoices(ILLIDARI);
assert.ok(projected);
assert.equal(projected.cardId, 'CORE_YOP_001');
assert.equal(projected.kind, 'discover');
assert.equal(projected.format, 'standard');
assert.equal(projected.rank, 'legend');
assert.equal(projected.state, 'ok');
assert.equal(projected.sourceUrl, 'https://hsreplay.net/cards/97377/');
assert.deepEqual(projected.options[0], {
  cardId: 'DINO_136', dbfId: 118503, name: 'Рог пиршества', cost: 4, cardClass: 'DEMONHUNTER', rarity: 'COMMON',
  popularity: 44.98, winrate: 45.26, lowSample: false, undervalued: false,
});
const undervalued = projected.options.filter(option => option.undervalued).map(option => option.name);
assert.deepEqual(undervalued, ['Космические воплощения']);
assert.equal(projected.pool.resolved, true);
assert.equal(projected.pool.total, 9);
assert.equal(projected.pool.cards[0].hasStats, true);
assert.deepEqual(projected.available.map(item => item.rank).sort(), ['bronze_gold', 'legend']);

// Untrusted bodies: a foreign link, a bad id and an unknown kind are dropped or refused.
const hostile = structuredClone(ILLIDARI);
hostile.data.stats.source_url = 'https://evil.example/';
hostile.data.options.push({ card_id: '<script>', name_ru: 'x' });
const cleaned = projectCardChoices(hostile);
assert.equal(cleaned?.sourceUrl, null);
assert.equal(cleaned?.options.length, ILLIDARI.data.options.length);
assert.equal(projectCardChoices({ data: { ...ILLIDARI.data, card: { ...ILLIDARI.data.card, kind: 'battlecry' } } }), null);
assert.equal(projectCardChoices(null), null);

// Router: one upstream read per card, format and rank inside the cache window.
const requested: string[] = [];
let now = 0;
let failUpstream = false;
const app = express();
app.use('/api', createCardChoicesRouter({
  request: async path => {
    requested.push(path);
    if (failUpstream) throw new Error('down');
    if (path.includes('card=CORE_BT_801')) return new Response('{"detail":"no choice"}', { status: 404 });
    return new Response(JSON.stringify(ILLIDARI), { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
  cacheMs: 1_000,
  now: () => now,
  onError: () => undefined,
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api`;

try {
  const first = await fetch(`${base}/card-choices/standard/CORE_YOP_001`);
  assert.equal(first.status, 200);
  assert.match(first.headers.get('cache-control') ?? '', /public, max-age=300/);
  assert.equal((await first.json()).options.length, 4);
  await fetch(`${base}/card-choices/standard/CORE_YOP_001`);
  assert.deepEqual(requested, ['/v1/hsreplay/card-choices?card=CORE_YOP_001&format=standard&rank=legend']);

  assert.equal((await fetch(`${base}/card-choices/standard/CORE_BT_801`)).status, 404);
  assert.equal((await fetch(`${base}/card-choices/twist/CORE_YOP_001`)).status, 404);
  assert.equal((await fetch(`${base}/card-choices/standard/CORE_YOP_001?rank=top_legend`)).status, 404);
  assert.equal((await fetch(`${base}/card-choices/standard/..%2Fadmin`)).status, 404);

  // A failed refresh keeps the last answer; a cold failure is 503.
  failUpstream = true;
  now = 5_000;
  assert.equal((await fetch(`${base}/card-choices/standard/CORE_YOP_001`)).status, 200);
  const cold = await fetch(`${base}/card-choices/wild/CORE_YOP_001?rank=bronze_gold`);
  assert.equal(cold.status, 503);
  assert.equal(cold.headers.get('retry-after'), '30');
} finally {
  await new Promise(resolve => server.close(resolve));
}

// Client model.
assert.equal(cardChoiceKindOf(['OUTCAST', 'DISCOVER']), 'discover');
assert.equal(cardChoiceKindOf(['CHOOSE_ONE', 'DISCOVER']), 'discover', 'a Choose One between Discovers counts as Discover');
assert.equal(cardChoiceKindOf(['BATTLECRY', 'EXCAVATE']), 'excavate');
assert.equal(cardChoiceKindOf(['CHOOSE_ONE']), 'choose_one');
assert.equal(cardChoiceKindOf(['TAUNT']), null);
assert.equal(cardChoiceKindOf(undefined), null);
assert.equal(cardChoiceTitle('discover'), 'Что берут из Открытия', 'Discover is «Открытие» on the site');
assert.equal(cardChoiceTitle('excavate'), 'Сокровища Добычи');
assert.equal(formatChoicePercent(47.2), '47,2%');
assert.equal(formatChoicePercent(null), '—');
// Options are compared with their own average (45.2% for Illidari Studies at Legend), not with 50%.
assert.equal(cardChoiceWinrateTone(50.2, 45.2), 'positive');
assert.equal(cardChoiceWinrateTone(37.3, 45.2), 'negative');
assert.equal(cardChoiceWinrateTone(43.4, 45.2), 'neutral');
assert.equal(cardChoiceWinrateTone(50, null), 'neutral');
assert.equal(Math.round((cardChoiceMeanWinrate(projected.options) ?? 0) * 10) / 10, 46.6, "the four options of the trimmed fixture");
const empty = { ...projected, options: [], state: 'no_data' } as CardChoicesData;
assert.match(cardChoiceEmptyText(empty, 'Бронза–Золото'), /^Мало данных: .*«Бронза–Золото»/);
assert.match(cardChoiceEmptyText({ ...empty, tracked: false, kind: 'excavate' }, 'Легенда'), /случайное сокровище/);
