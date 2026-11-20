import assert from 'node:assert/strict';
import test from 'node:test';
import { createHeroProfileLoader, projectBattlegroundHeroProfile } from '../server/battlegroundHeroPublicProfile.ts';

// A library row as `/api/v1/heroes?dbf=` answers it, with a sentinel in every field the open profile must not copy:
// the patch history, statistics a library row could carry, and extra fields next to each copied one (a projection
// that spreads a record instead of copying fields by name leaks them).
const CLOSED = 'SENTINEL_CLOSED';
const imageUrl = (value: unknown) => typeof value === 'string' && value.startsWith('https://img.example/')
  ? `https://hearthpulse.net/api/public-resource/${value.slice('https://img.example/'.length)}` : null;
const row = {
  dbf: 59807, card_id: 'TB_BaconShop_HERO_37', hero_id: `${CLOSED}_hero_id`, name: { ru: 'Лорд Джараксус' },
  health: 30, armor: { normal: 15, duos: 12, text: `${CLOSED}_armor_text` }, artist: 'Alex Horley', race: 'Eredar',
  character: { name: 'Lord Jaraxxus', description: 'All will bend <b>before</b> Lord Jaraxxus!', note: `${CLOSED}_character` },
  images: { hero: 'https://img.example/hero.png', full_art: 'https://img.example/full.jpg', tile: `${CLOSED}_tile` },
  tile_layout: { title: { text: `${CLOSED}_tile_layout` } },
  placement_distribution: [`${CLOSED}_placement`], combat_winrate: [`${CLOSED}_combat`],
  hero_power_by_turn: [`${CLOSED}_power_by_turn`], tavern_up_by_turn: [`${CLOSED}_tavern`],
  compositions: [{ name: `${CLOSED}_composition` }], best_composition: `${CLOSED}_best_composition`,
  buddy: { dbf: 77798, card: {
    name: "Кил'рек", text: '<b>Провокация</b>', image: 'https://img.example/buddy.png', image_gold: 'https://img.example/buddy-g.png',
    crop_image: `${CLOSED}_crop`, sounds: [`${CLOSED}_sounds`], parent_id: `${CLOSED}_parent`,
    golden: { name: "Кил'рек", text: 'Золотой', image: 'https://img.example/golden.png', card_type: `${CLOSED}_golden_type` },
  } },
  wiki: {
    status: `${CLOSED}_wiki_status`,
    page: { title: `${CLOSED}_page_title`, url: 'https://hearthstone.wiki.gg/wiki/Battlegrounds/Lord_Jaraxxus' },
    availability: { notes: [`${CLOSED}_availability`] },
    card_changes: [{ version: `${CLOSED}_patch`, changes: [`${CLOSED}_patch_change`] }],
    gallery: [`${CLOSED}_gallery`],
    hero_skins: [{ cards: [
      { card_id: 'TB_BaconShop_HERO_37_SKIN_A', title: 'Shado-pan Jaraxxus', image_url: 'https://img.example/skin-a.png',
        url: 'https://hearthstone.wiki.gg/wiki/Battlegrounds/Shado-pan_Jaraxxus', image_alt: `${CLOSED}_skin_alt`, caption: `${CLOSED}_caption` },
      { card_id: 'SKIN_B', title: 'Off-proxy skin', image_url: 'https://elsewhere.example/skin-b.png', url: null },
    ] }],
    external_links: [
      { label: 'HSReplay.net', url: 'https://hsreplay.net/cards/59807', rank: `${CLOSED}_link_rank` },
      { label: 'Phishing', url: 'https://evil.example/hero' },
    ],
  },
};

test('the open hero profile copies game content by name and nothing closed', () => {
  const profile = projectBattlegroundHeroProfile({ data: [{ dbf: 1 }, row] }, 59807, imageUrl);
  assert.deepEqual(profile, {
    artist: 'Alex Horley', race: 'Eredar', health: 30, armor: { normal: 15, duos: 12 },
    description: 'All will bend before Lord Jaraxxus!',
    fullArt: 'https://hearthpulse.net/api/public-resource/full.jpg',
    buddy: {
      name: "Кил'рек", text: 'Провокация', image: 'https://hearthpulse.net/api/public-resource/buddy.png',
      imageGold: 'https://hearthpulse.net/api/public-resource/buddy-g.png',
      golden: { name: "Кил'рек", text: 'Золотой', image: 'https://hearthpulse.net/api/public-resource/golden.png', imageGold: null },
    },
    // A skin whose picture the proxy does not serve is dropped; a link to another host is dropped.
    skins: [{ cardId: 'TB_BaconShop_HERO_37_SKIN_A', title: 'Shado-pan Jaraxxus',
      image: 'https://hearthpulse.net/api/public-resource/skin-a.png',
      url: 'https://hearthstone.wiki.gg/wiki/Battlegrounds/Shado-pan_Jaraxxus' }],
    links: [
      { label: 'Hearthstone Wiki', url: 'https://hearthstone.wiki.gg/wiki/Battlegrounds/Lord_Jaraxxus' },
      { label: 'HSReplay.net', url: 'https://hsreplay.net/cards/59807' },
    ],
  });
  assert.equal(JSON.stringify(profile).includes(CLOSED), false, 'no closed field reaches the open profile');
  assert.equal(projectBattlegroundHeroProfile({ data: [row] }, 1, imageUrl), null, 'another hero has no profile here');
  assert.equal(projectBattlegroundHeroProfile({ error: 'x' }, 59807, imageUrl), null);
});

test('the profile loader keeps a hero, answers the last good profile when the library fails and holds 256 heroes', async () => {
  let now = 0;
  const reads: string[] = [];
  let failing = false;
  const errors: unknown[] = [];
  const library = (dbfId: number) => ({ data: [{ ...row, dbf: dbfId }] });
  const load = createHeroProfileLoader({
    libraryUrl: dbfId => `https://library.example/heroes?dbf=${dbfId}`, imageUrl, now: () => now,
    onError: error => errors.push(error),
    fetchImpl: async url => {
      reads.push(String(url));
      if (failing) return new Response('{}', { status: 503 });
      return new Response(JSON.stringify(library(Number(new URL(String(url)).searchParams.get('dbf')))), { status: 200 });
    },
  });
  assert.equal((await load(59807))?.artist, 'Alex Horley');
  now = 9 * 60_000;
  await load(59807);
  assert.equal(reads.length, 1, 'fresh for ten minutes');

  now = 11 * 60_000;
  failing = true;
  assert.equal((await load(59807))?.artist, 'Alex Horley', 'a failing library answers the last good profile');
  assert.equal(reads.length, 2);
  now += 30_000;
  assert.equal((await load(59807))?.artist, 'Alex Horley');
  assert.equal(reads.length, 2, 'a failing library is not asked again for a minute');
  assert.equal(await load(1), null, 'a hero never read is null while the library fails');
  now += 31_000;
  failing = false;
  await load(59807);
  assert.equal(reads.length, 4, 'asked again after the pause');
  assert.equal(errors.length, 2);

  // At most 256 heroes are kept: the least recently read goes first, and is read again when asked.
  for (let dbfId = 1000; dbfId < 1256; dbfId += 1) await load(dbfId);
  const before = reads.length;
  await load(1255);
  assert.equal(reads.length, before, 'a kept hero is not read again');
  await load(59807);
  assert.equal(reads.length, before + 1, 'the least recently read hero was dropped');
});

test('concurrent requests share one read, a malformed answer keeps the last good profile, reads in flight are capped', async () => {
  let now = 0;
  const reads: number[] = [];
  const pending = new Map<number, Array<(response: Response) => void>>();
  const respond = (dbfId: number, body: unknown, status = 200) => {
    for (const resolve of pending.get(dbfId) ?? []) resolve(new Response(JSON.stringify(body), { status }));
    pending.delete(dbfId);
  };
  const load = createHeroProfileLoader({
    libraryUrl: dbfId => `https://library.example/heroes?dbf=${dbfId}`, imageUrl, now: () => now,
    fetchImpl: url => {
      const dbfId = Number(new URL(String(url)).searchParams.get('dbf'));
      reads.push(dbfId);
      return new Promise<Response>(resolve => pending.set(dbfId, [...(pending.get(dbfId) ?? []), resolve]));
    },
  });
  const tick = () => new Promise(resolve => setImmediate(resolve));

  // A cold burst for one hero: one read, every request gets its answer.
  const burst = [load(59807), load(59807), load(59807)];
  await tick();
  assert.deepEqual(reads, [59807]);
  respond(59807, { data: [row] });
  assert.deepEqual((await Promise.all(burst)).map(profile => profile?.artist), ['Alex Horley', 'Alex Horley', 'Alex Horley']);

  // An expired hero whose library answers 200 without a `data` list, or a list without the hero: the last good profile
  // stays (no fresh `null`), and the hero waits out the failure pause.
  now = 11 * 60_000;
  const malformed = load(59807);
  await tick();
  respond(59807, { error: 'unavailable' });
  assert.equal((await malformed)?.artist, 'Alex Horley');
  now += 61_000;
  const missing = load(59807);
  await tick();
  respond(59807, { data: [] });
  assert.equal((await missing)?.artist, 'Alex Horley');
  const readsBefore = reads.length;
  assert.equal((await load(59807))?.artist, 'Alex Horley', 'within the pause');
  assert.equal(reads.length, readsBefore);

  // A hero never read that fails: null, and not asked again within the pause.
  const cold = load(7);
  await tick();
  respond(7, {}, 503);
  assert.equal(await cold, null);
  assert.equal(await load(7), null);
  assert.equal(reads.filter(dbfId => dbfId === 7).length, 1);

  // At most 16 reads in flight: a 17th hero is answered without a read until one settles.
  const many = Array.from({ length: 17 }, (_, index) => load(2000 + index));
  await tick();
  assert.equal(reads.filter(dbfId => dbfId >= 2000 && dbfId < 2017).length, 16);
  assert.equal(await many[16], null);
  for (let dbfId = 2000; dbfId < 2016; dbfId += 1) respond(dbfId, { data: [{ ...row, dbf: dbfId }] });
  assert.equal((await Promise.all(many.slice(0, 16))).every(profile => profile?.artist === 'Alex Horley'), true);
});

test('a refresh keeps its starting profile when the hero is dropped meanwhile; a throwing or rejecting fetch is a failure', async () => {
  let now = 0;
  let mode: 'ok' | 'hold' | 'throw' | 'reject' = 'ok';
  let held: ((response: Response) => void) | null = null;
  const load = createHeroProfileLoader({
    libraryUrl: dbfId => `https://library.example/heroes?dbf=${dbfId}`, imageUrl, now: () => now,
    fetchImpl: url => {
      const dbfId = Number(new URL(String(url)).searchParams.get('dbf'));
      if (mode === 'throw') throw new Error('synchronous failure');
      if (mode === 'reject') return Promise.reject(new Error('network'));
      if (mode === 'hold' && dbfId === 59807) return new Promise<Response>(resolve => { held = resolve; });
      return Promise.resolve(new Response(JSON.stringify({ data: [{ ...row, dbf: dbfId }] }), { status: 200 }));
    },
  });
  assert.equal((await load(59807))?.artist, 'Alex Horley');
  now = 11 * 60_000;
  mode = 'hold';
  const refresh = load(59807);
  await new Promise(resolve => setImmediate(resolve));
  for (let dbfId = 3000; dbfId < 3256; dbfId += 1) await load(dbfId); // drops 59807 from the cache
  assert.ok(held);
  (held as (response: Response) => void)(new Response('{"error":"x"}', { status: 200 }));
  assert.equal((await refresh)?.artist, 'Alex Horley', 'the profile the refresh started from');

  for (const failure of ['throw', 'reject'] as const) {
    now += 11 * 60_000;
    mode = failure;
    assert.equal((await load(59807))?.artist, 'Alex Horley', `a ${failure} keeps the last good profile`);
    mode = 'ok';
    assert.equal((await load(59807))?.artist, 'Alex Horley', 'and the hero is not left in flight');
  }
});

test('a picture the library names by its own path is resolved against the library', async () => {
  const load = createHeroProfileLoader({
    libraryUrl: dbfId => `https://img.example/api/v1/heroes?dbf=${dbfId}`, imageUrl,
    fetchImpl: async () => new Response(JSON.stringify({ data: [{ ...row,
      buddy: { card: { ...row.buddy.card, image_gold: '/uploads/golden/buddy.png' } } }] }), { status: 200 }),
  });
  assert.equal((await load(59807))?.buddy?.imageGold, 'https://hearthpulse.net/api/public-resource/uploads/golden/buddy.png');
});
