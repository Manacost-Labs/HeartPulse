import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const shared = await readFile(new URL('../public/bg-legacy/shared.js', import.meta.url), 'utf8');
const record = (id, overrides = {}) => ({
  card_id: id, dbf: 123, card_type: { slug: 'minion' }, in_pool: true,
  name: { ru: id, en: `English ${id}` }, tavern_tier: 3,
  creature_type: { slug: 'aberration' }, images: { art: `/art/${id}.jpg` },
  text_ru: 'Текст карты.\nМеханики: BATTLECRY\nEN: Card text.', ...overrides,
});

function runtime(fetchImpl) {
  const window = { setTimeout, clearTimeout };
  vm.runInNewContext(shared, {
    window, document: { readyState: 'loading', addEventListener() {} },
    fetch: fetchImpl, console: { warn() {} }, URL, URLSearchParams,
    AbortController, setTimeout, clearTimeout,
  });
  return window.Shared;
}

test('builders use all canonical pool pages, remove rotated cards and preserve dual races', async () => {
  const calls = [];
  const api = runtime(async (url) => {
    calls.push(url);
    const payload = url.startsWith('/api/battlegrounds-library?')
      ? { cards: [{ id: 'REMOVED', name: 'Old' }, { id: 'KEPT', races: ['BEAST', 'UNDEAD'], artUrl: '/old-art' }] }
      : { data: [record(new URL(url, 'http://test').searchParams.get('page') === '2' ? 'NEW_DUO' : 'KEPT', { duos_only: new URL(url, 'http://test').searchParams.get('page') === '2' })], pagination: { total_pages: 2, total: 2 } };
    return { ok: true, json: async () => payload };
  });
  const result = await api.loadBattlegroundsLibrary({ locale: 'ruRU', includeEnglish: true });
  assert.deepEqual(Array.from(result.cards, c => c.id), ['KEPT', 'NEW_DUO']);
  assert.deepEqual(Array.from(result.cards[0].races), ['BEAST', 'UNDEAD']);
  assert.deepEqual(Array.from(result.cards[1].races), ['ABERRATION']);
  assert.equal(result.cards[1].duosOnly, true);
  assert.equal(result.cards[1].text, 'Текст карты.');
  assert.equal(result.cards[1].englishName, 'English NEW_DUO');
  assert.equal(result.cards[1].artUrl, '/art/NEW_DUO.jpg');
  assert.ok(calls.filter(url => url.startsWith('/api/bg/library/cards?')).every(url => new URL(url, 'http://test').searchParams.get('v') === 'bg-pool-36.6.1'));
  assert.ok(calls.some(url => url.includes('in_pool=1') && new URL(url, 'http://test').searchParams.get('page') === '2'));
});

test('an incomplete canonical pool uses the complete bundled snapshot, never stale source flags', async () => {
  const api = runtime(async (url) => {
    if (url.startsWith('/bg-legacy/')) return { ok: true, json: async () => ({ cards: [{ id: 'FALLBACK' }] }) };
    if (url.startsWith('/api/battlegrounds-library?')) return { ok: true, json: async () => ({ cards: [{ id: 'REMOVED' }] }) };
    if (new URL(url, 'http://test').searchParams.get('page') === '2') return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ data: [record('NEW')], pagination: { total_pages: 2, total: 2 } }) };
  });
  assert.equal((await api.loadBattlegroundsLibrary()).cards[0].id, 'FALLBACK');
});

test('missing legacy metadata does not prevent corrected cards from loading', async () => {
  const api = runtime(async (url) => ({
    ok: !url.startsWith('/api/battlegrounds-library?'), status: 503,
    json: async () => ({ data: [record('NEW', { creature_type: { slug: 'mech' } })], pagination: { total_pages: 1, total: 1 } }),
  }));
  const result = await api.loadBattlegroundsLibrary();
  assert.equal(result.cards[0].id, 'NEW');
  assert.deepEqual(Array.from(result.cards[0].races), ['MECHANICAL']);
});

test('bundled 36.6.1 snapshot contains corrected Tavern cards and excludes generated cards', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../public/bg-legacy/bgs-library.json', import.meta.url), 'utf8'));
  const ids = new Set(snapshot.cards.map(card => card.id));
  assert.equal(snapshot.count, 304);
  assert.equal(ids.size, snapshot.count);
  assert.equal(snapshot.cards.filter(card => card.races.includes('ABERRATION')).length, 27);
  for (const id of ['BGDUO_700', 'BGDUO_701', 'BG36_369', 'BGS_034', 'BG36_360t3', 'BG36_360t9']) assert.ok(ids.has(id), id);
  for (const id of ['BG27_002', 'BG_TTN_401', 'BGFYM_000', 'BGFYM_011', 'BG34_170t', 'BG34_170t2', 'BG34_170t3', 'BG36_360']) assert.ok(!ids.has(id), id);
});
