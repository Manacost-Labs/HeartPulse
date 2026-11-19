import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { createCardAssembleRouter, projectCardAssemble } from '../server/modules/constructedCards/public.js';
import {
  assembleFullText, assembleMeanWinrate, assembleOptionsOfBase, assembleWinrateTone, bestOfOffered, isAssembleCard,
  type AssembleBase, type AssembleDonor, type AssembleOption,
} from '../src/modules/constructedCards/model/cardAssemble.js';

// Contract fixture of hs-data-api #136 (`/v1/hsreplay/assemble`, F3TCH3R): shape per the contract, numbers illustrative except Cairne's.
const CONTRACT = JSON.parse(readFileSync(new URL('./fixtures/card-assemble-contract-be044.json', import.meta.url), 'utf8'));

// Projection: Russian names, one text locale, donors only where the upstream sent them.
const projected = projectCardAssemble(CONTRACT);
assert.ok(projected);
assert.equal(projected.cardId, 'BE_044');
assert.equal(projected.format, 'standard');
assert.equal(projected.state, 'ok');
assert.equal(projected.sourceUrl, 'https://hsreplay.net/cards/assemble-pools/');
assert.equal(projected.originalClassOnly, true);
assert.equal(projected.basesTotal, 38);
assert.equal(projected.winRate, 51.2);
assert.deepEqual(projected.bases.map(base => base.card.cardId), ['TIME_100', 'BT_716', 'CORE_EX1_011']);
assert.equal(projected.bases[0].card.name, 'Смотритель песочных часов');
assert.equal(projected.bases[0].donorsTotal, 41);
assert.equal(projected.bases[1].donors, null);
assert.equal(projected.bases[0].donors?.length, 4);
const cairne = projected.bases[0].donors![0];
assert.equal(cairne.card.cardId, 'CORE_EX1_110');
assert.deepEqual(cairne.options.map(option => option.half), ['effect', 'trigger']);
assert.deepEqual(cairne.options[0], {
  half: 'effect',
  text: { trigger: 'В конце вашего хода', effect: 'призывает Бейна Кровавое Копыто 5/5.', locale: 'ru' },
  pickRate: 84.3, winRate: 69.5, picks: 398, lowSample: false, undervalued: false,
});
assert.equal(assembleFullText(cairne.options[0].text), 'В конце вашего хода призывает Бейна Кровавое Копыто 5/5.');
assert.equal(cairne.options[1].lowSample, true);
// `text.ru: null` falls back to English, flagged by the locale.
const duck = projected.bases[0].donors![2];
assert.deepEqual(duck.options[1].text, { trigger: 'Deathrattle:', effect: 'Summon a 1/1 Duckling.', locale: 'en' });
assert.equal(JSON.stringify(projected).includes('"name_ru"'), false);

// No text in either locale: the text is null.
const noText = structuredClone(CONTRACT);
noText.data.bases[0].donors[0].options[0].text = { ru: null, en: null };
assert.equal(projectCardAssemble(noText)?.bases[0].donors?.[0].options[0].text, null);

// Untrusted body: bad fields are dropped or nulled, the answer survives.
const hostile = structuredClone(CONTRACT);
hostile.data.stats.source_url = 'https://evil.example/';
hostile.data.bases[0].donors[0].options[0].half = 'x';
hostile.data.bases[0].donors[1].pick_rate = 140;
hostile.data.bases[0].donors[1].win_rate = -3;
hostile.data.bases[0].donors[1].picks = 1.5;
hostile.data.bases[0].donors[2].options[0].text.ru.effect = 'я'.repeat(401);
hostile.data.bases.push({ card: { card_id: '<script>', dbf_id: 1, name: 'x' }, donors: null });
hostile.data.bases.push({ card: { card_id: 'OK_CARD', dbf_id: 2 ** 60, name: 'x' }, donors: null });
hostile.data.bases[0].donors.push({ card: { card_id: 'a b', dbf_id: 5 }, options: [] });
const cleaned = projectCardAssemble(hostile);
assert.ok(cleaned);
assert.equal(cleaned.sourceUrl, null);
assert.equal(cleaned.bases.length, 3);
assert.deepEqual(cleaned.bases[0].donors?.map(donor => donor.card.cardId), ['JAIL_007', 'EDR_492', 'BE_550'], 'the donor with a broken half is dropped');
assert.equal(cleaned.bases[0].donors![0].pickRate, null);
assert.equal(cleaned.bases[0].donors![0].winRate, null);
assert.equal(cleaned.bases[0].donors![0].picks, null);
assert.equal(cleaned.bases[0].donors![1].options[0].text?.locale, 'en', 'an over-long ru text falls back to en');

// A donor has exactly two different halves, effect first; anything else drops the donor.
const halves = structuredClone(CONTRACT);
const donors = halves.data.bases[0].donors;
donors[0].options = [donors[0].options[0]];
donors[1].options = [donors[1].options[0], donors[1].options[0]];
donors[2].options = [donors[2].options[1], donors[2].options[0]];
donors[3].options[0].half = 'x';
const twoHalves = projectCardAssemble(halves)?.bases[0].donors;
assert.deepEqual(twoHalves?.map(donor => donor.card.cardId), ['EDR_492']);
assert.deepEqual(twoHalves?.[0].options.map(option => option.half), ['effect', 'trigger']);
for (const donor of projected.bases[0].donors!) assert.equal(donor.options.length, 2);

// The answer must be for the requested card and format (the id may be the dbf id too).
assert.ok(projectCardAssemble(CONTRACT, { cardId: 'BE_044', format: 'standard' }));
assert.ok(projectCardAssemble(CONTRACT, { cardId: 'be_044', format: 'standard' }));
assert.ok(projectCardAssemble(CONTRACT, { cardId: '128892', format: 'standard' }));
assert.equal(projectCardAssemble(CONTRACT, { cardId: 'BE_045', format: 'standard' }), null);
assert.equal(projectCardAssemble(CONTRACT, { cardId: 'BE_044', format: 'wild' }), null);
assert.equal(projectCardAssemble(CONTRACT, { cardId: '128893', format: 'standard' }), null);
const flood = structuredClone(CONTRACT);
flood.data.bases = Array.from({ length: 1000 }, (_, index) => ({ ...CONTRACT.data.bases[1], card: { ...CONTRACT.data.bases[1].card, dbf_id: index + 1 } }));
flood.data.bases[0].donors = Array.from({ length: 500 }, () => CONTRACT.data.bases[0].donors[0]);
const capped = projectCardAssemble(flood);
assert.equal(capped?.bases.length, 300);
assert.equal(capped?.bases[0].donors?.length, 200);
assert.equal(projectCardAssemble(null), null);
assert.equal(projectCardAssemble({ data: { ...CONTRACT.data, format: 'twist' } }), null);
assert.equal(projectCardAssemble({ data: { ...CONTRACT.data, card: { card_id: '../x', dbf_id: 1 } } }), null);

// Router: one upstream read per card, format and base inside the cache window.
const requested: string[] = [];
let now = 0;
let failUpstream = false;
const app = express();
app.use('/api', createCardAssembleRouter({
  request: async path => {
    requested.push(path);
    if (failUpstream) throw new Error('down');
    if (path.includes('card=CORE_EX1_110')) return new Response('{"detail":"not assemble"}', { status: 404 });
    if (path.includes('card=BE_045')) return new Response('{"detail":"oops"}', { status: 500 });
    if (path.includes('card=BE_046')) return new Response('{"data":{}}', { status: 200 });
    if (path.includes('card=BE_047') || path.includes('format=wild')) return new Response(JSON.stringify(CONTRACT), { status: 200 });
    return new Response(JSON.stringify(CONTRACT), { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
  cacheMs: 1_000,
  now: () => now,
  onError: () => undefined,
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const root = `http://127.0.0.1:${address.port}/api`;

try {
  const first = await fetch(`${root}/card-assemble/standard/BE_044`);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'public, max-age=300, stale-while-revalidate=600');
  const body = await first.json();
  assert.equal(body.bases.length, 3);
  assert.equal(body.bases[0].donors[0].options[0].text.effect, 'призывает Бейна Кровавое Копыто 5/5.');
  await fetch(`${root}/card-assemble/standard/BE_044`);
  await fetch(`${root}/card-assemble/standard/BE_044?base=top`);
  assert.deepEqual(requested, ['/v1/hsreplay/assemble?card=BE_044&format=standard&base=top']);
  assert.equal((await fetch(`${root}/card-assemble/standard/BE_044?base=121051`)).status, 200);
  assert.equal(requested[1], '/v1/hsreplay/assemble?card=BE_044&format=standard&base=121051');

  // Bad parameters never reach the upstream.
  const before = requested.length;
  for (const path of ['twist/BE_044', 'standard/..%2Fadmin', 'standard/BE_044?base=abc', 'standard/BE_044?base=12.5', 'standard/BE_044?base=-1',
    'standard/BE_044?base=top&base=1', 'standard/BE_044?base=99999999999999999999', 'standard/%3Cscript%3E']) {
    const rejected = await fetch(`${root}/card-assemble/${path}`);
    assert.equal(rejected.status, 404, path);
    assert.equal(rejected.headers.get('cache-control'), 'no-store', path);
  }
  assert.equal(requested.length, before);

  // Upstream 404 is 404; a cold 500 or contract mismatch is 503 with Retry-After.
  assert.equal((await fetch(`${root}/card-assemble/standard/CORE_EX1_110`)).status, 404);
  // A valid answer for another card or format is a contract mismatch and is never cached.
  for (const path of ['standard/BE_047', 'wild/BE_044']) {
    assert.equal((await fetch(`${root}/card-assemble/${path}`)).status, 503, path);
  }
  failUpstream = true;
  assert.equal((await fetch(`${root}/card-assemble/standard/BE_047`)).status, 503, 'not cached');
  failUpstream = false;
  for (const id of ['BE_045', 'BE_046']) {
    const cold = await fetch(`${root}/card-assemble/standard/${id}`);
    assert.equal(cold.status, 503, id);
    assert.equal(cold.headers.get('retry-after'), '30');
    assert.equal(cold.headers.get('cache-control'), 'no-store');
  }

  // A failed refresh keeps the last answer; a cold failure is 503.
  failUpstream = true;
  now = 5_000;
  assert.equal((await fetch(`${root}/card-assemble/standard/BE_044`)).status, 200);
  const cold = await fetch(`${root}/card-assemble/wild/BE_044?base=121051`);
  assert.equal(cold.status, 503);
  assert.equal(cold.headers.get('retry-after'), '30');
} finally {
  await new Promise(resolve => server.close(resolve));
}

// Detection by the keyword in the Russian or English text; literals of the 13 cards are from HSJ ruRU/enUS (2026-11-19).
const HSJ_TEXTS = JSON.parse(readFileSync(new URL('./fixtures/card-assemble-hsj-texts.json', import.meta.url), 'utf8')) as Record<string, { ru: string; en: string }>;
assert.equal(Object.keys(HSJ_TEXTS).length, 13);
for (const [id, texts] of Object.entries(HSJ_TEXTS)) {
  assert.equal(isAssembleCard({ text: { ru: texts.ru, en: null } }), true, `${id} ru`);
  assert.equal(isAssembleCard({ text: { ru: null, en: texts.en } }), true, `${id} en`);
}
assert.equal(isAssembleCard({ text: { ru: HSJ_TEXTS.BE_740.ru, en: null } }), true, 'Вы <b>собираете</b>');
assert.equal(isAssembleCard({ mechanics: ['BATTLECRY', 'ASSEMBLE'], text: null }), true);
assert.equal(isAssembleCard({ text: { ru: '<b>Раскопка</b> сокровища.', en: '<b>Excavate</b> a treasure.' }, mechanics: ['EXCAVATE'] }), false);
assert.equal(isAssembleCard({ text: { ru: 'Собирает всё, что плохо лежит.', en: 'Assemble your team.' } }), false, 'plain words are not the keyword');
assert.equal(isAssembleCard({ text: { ru: '<b>Собирательство</b> 2', en: null } }), false);
assert.equal(isAssembleCard({ text: { ru: '<b>Боевой клич:</b> наносит 2 ед. урона.', en: null }, mechanics: ['BATTLECRY'] }), false);
assert.equal(isAssembleCard(null), false);

// «Лучшие сборки»: by pick rate, small samples last.
const base = projected.bases[0] as AssembleBase;
const flat = assembleOptionsOfBase(base).map(item => `${item.donor.card.cardId}:${item.option.half}`);
assert.deepEqual(flat, [
  'CORE_EX1_110:effect', 'JAIL_007:effect', 'EDR_492:effect', 'BE_550:trigger', 'BE_550:effect', 'JAIL_007:trigger',
  'EDR_492:trigger', 'CORE_EX1_110:trigger',
]);
assert.deepEqual(assembleOptionsOfBase(projected.bases[1]), [], 'donors not loaded');

// Winrate tone against the base's own average of real samples.
const mean = assembleMeanWinrate(base);
assert.equal(Math.round((mean ?? 0) * 100) / 100, 54.5);
assert.equal(assembleWinrateTone(69.5, base), 'positive');
assert.equal(assembleWinrateTone(47, base), 'negative');
assert.equal(assembleWinrateTone(54, base), 'neutral');
assert.equal(assembleWinrateTone(null, base), 'neutral');
assert.equal(assembleMeanWinrate(projected.bases[1]), null);

// «Мне предложили»: the best of the four variants of two donors.
const offered = bestOfOffered(base, 'CORE_EX1_110', 'JAIL_007');
assert.ok(offered);
assert.equal(offered.variants.length, 4);
assert.equal(offered.best.donor.card.cardId, 'CORE_EX1_110');
assert.equal(offered.best.option.half, 'effect');
assert.equal(assembleFullText(offered.best.option.text), 'В конце вашего хода призывает Бейна Кровавое Копыто 5/5.');
assert.equal(offered.lowSample, false);
assert.equal(bestOfOffered(base, base.donors![0], base.donors![1])?.best.option.winRate, 69.5, 'donor objects work too');
assert.equal(bestOfOffered(base, 'CORE_EX1_110', 'CORE_EX1_110'), null, 'one donor twice is not a pair');
assert.equal(bestOfOffered(base, 'CORE_EX1_110', 'NO_SUCH_DONOR'), null);
assert.equal(bestOfOffered(projected.bases[1], 'CORE_EX1_110', 'JAIL_007'), null, 'donors not loaded');
// A low-sample variant with the top winrate does not win while a real sample exists.
const solidWins = bestOfOffered(base, 'EDR_492', 'BE_550');
assert.equal(solidWins?.best.donor.card.cardId, 'EDR_492');
assert.equal(solidWins?.best.option.winRate, 54.1);

const option = (half: 'effect' | 'trigger', winRate: number | null, pickRate: number | null, lowSample: boolean): AssembleOption => ({
  half, text: null, winRate, pickRate, picks: null, lowSample, undervalued: false,
});
const donorOf = (cardId: string, options: AssembleOption[]): AssembleDonor => ({
  card: { cardId, dbfId: 1, name: cardId, cost: null, cardClass: null, rarity: null },
  offerRate: null, pickRate: null, winRate: null, picks: null, lowSample: false, options,
});
const baseOf = (donors: AssembleDonor[]): AssembleBase => ({ ...base, donors });
// All small samples: the best winrate, flagged.
const weak = baseOf([
  donorOf('A_ONE', [option('effect', 60, 5, true), option('trigger', 52, 4, true)]),
  donorOf('B_TWO', [option('effect', 58, 9, true), option('trigger', 41, 1, true)]),
]);
const weakBest = bestOfOffered(weak, 'A_ONE', 'B_TWO');
assert.equal(weakBest?.lowSample, true);
assert.equal(weakBest?.best.donor.card.cardId, 'A_ONE');
assert.equal(weakBest?.best.option.winRate, 60);
// A tie in winrate goes to the higher pick rate.
const tie = baseOf([
  donorOf('A_ONE', [option('effect', 55, 20, false), option('trigger', 50, 4, false)]),
  donorOf('B_TWO', [option('effect', 55, 31, false), option('trigger', 50, 1, false)]),
]);
assert.equal(bestOfOffered(tie, 'A_ONE', 'B_TWO')?.best.donor.card.cardId, 'B_TWO');
assert.equal(bestOfOffered(tie, 'B_TWO', 'A_ONE')?.best.donor.card.cardId, 'B_TWO', 'order of the pair does not matter');
// No winrate anywhere: nothing to recommend.
const blank = baseOf([donorOf('A_ONE', [option('effect', null, 5, false)]), donorOf('B_TWO', [option('effect', null, 5, false)])]);
assert.equal(bestOfOffered(blank, 'A_ONE', 'B_TWO'), null);
