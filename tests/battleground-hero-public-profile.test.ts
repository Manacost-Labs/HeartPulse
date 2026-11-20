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

test('the profile loader keeps a hero for ten minutes and answers null when the library fails', async () => {
  let now = 0;
  const reads: string[] = [];
  let failing = false;
  const errors: unknown[] = [];
  const load = createHeroProfileLoader({
    libraryUrl: dbfId => `https://library.example/heroes?dbf=${dbfId}`, imageUrl, now: () => now,
    onError: error => errors.push(error),
    fetchImpl: async url => {
      reads.push(String(url));
      if (failing) return new Response('{}', { status: 503 });
      return new Response(JSON.stringify({ data: [row] }), { status: 200 });
    },
  });
  assert.equal((await load(59807))?.artist, 'Alex Horley');
  now = 9 * 60_000;
  await load(59807);
  assert.equal(reads.length, 1, 'kept within ten minutes');
  now = 11 * 60_000;
  failing = true;
  assert.equal(await load(59807), null, 'a failing library is no profile, not a stale one');
  assert.equal(reads.length, 2);
  assert.equal(errors.length, 1);
});
