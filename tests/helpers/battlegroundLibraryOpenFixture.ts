import assert from 'node:assert/strict';

// Fixtures of the open library (E21): a catalog of minions and spells, the base statistics slice of hs-data-api and a staged
// listing, every closed figure with a mark of its own so the sentinel checks can look for it anywhere.

export const CLOSED = ['SENTINEL_IMPACT_0417', 'SENTINEL_WINRATE_0418', 'SENTINEL_ROUND_0419', 'SENTINEL_PURCHASE_0420',
  'SENTINEL_POSITION_0421', 'SENTINEL_HISTORY_0422', 'SENTINEL_RAW_0423'];
export const leaks = (text: string) => CLOSED.filter(value => text.includes(value));

export const slug = (name: string) => name.toLowerCase().replace(/[^a-zа-я0-9]+/g, '-').replace(/^-|-$/g, '');
export const catalogCard = (dbf: number, name: string, extra: Record<string, unknown> = {}, inPool = true) => ({
  dbf, card_type: { slug: 'minion', name_ru: 'Существо' }, name: { ru: name, en: `${name} EN` }, tavern_tier: 2,
  creature_type: { slug: 'beast', name_ru: 'Зверь' }, attack: 3, health: 4, in_pool: inPool,
  mechanics: [{ slug: 'TAUNT', name_ru: 'Провокация' }], text_ru: 'Провокация.',
  images: { card: `https://api.kolodahearthstone.com/uploads/cards/${dbf}.png`, horizontal: `https://api.kolodahearthstone.com/uploads/horizontal-art/${dbf}.webp` },
  golden_variant: { attack: 6, health: 8 },
  // Closed marks on the catalog row too: no projection may carry them.
  impact: CLOSED[0], combat_winrate: CLOSED[1], rounds: [CLOSED[2]], purchases: [CLOSED[3]], positions: CLOSED[4], history: [CLOSED[5]], raw: { value: CLOSED[6] },
  ...extra,
});

export const catalogs: Record<string, unknown[]> = {
  'minion:1': [catalogCard(1001, 'Первый зверь'), catalogCard(1002, 'Второй зверь', { tavern_tier: 3 }),
    catalogCard(1003, 'Мурлок', { creature_type: { slug: 'murloc', name_ru: 'Мурлок' } }), catalogCard(1004, 'Без выборки')],
  'minion:0': [catalogCard(2001, 'Старый зверь', {}, false)],
  'spell:1': [{ ...catalogCard(3001, 'Заклинание'), card_type: { slug: 'spell', name_ru: 'Заклинание' }, creature_type: null, attack: null, health: null, mechanics: [], golden_variant: null }],
  'spell:0': [{ ...catalogCard(3002, 'Старое заклинание', {}, false), card_type: { slug: 'spell', name_ru: 'Заклинание' }, creature_type: null, attack: null, health: null, mechanics: [], golden_variant: null }],
};
const statsRow = (dbf: number, games: number) => ({
  dbf_id: dbf, avg_placement_with: 3.9, avg_placement_without: 4.2, popularity: 7.5, games_with_minion: games, games_without_minion: 5000,
  impact: CLOSED[0], combat_winrate: CLOSED[1], rounds: [CLOSED[2]], purchases: [CLOSED[3]], positions: { board: CLOSED[4] }, history: [CLOSED[5]], raw: CLOSED[6],
});
export const statsPayload = () => ({
  latest_run: { mmr_percentile: 'TOP_50_PERCENT', completed_at: '2026-11-19T02:45:13Z' },
  minions: [statsRow(1001, 900), statsRow(1002, 31), statsRow(1004, 29)],
});
const extraPage = (page: number, label: string) => ({
  data: [{ dbf: 4000 + page, name: { ru: `${label} ${page}`, en: 'x' }, group: { name_ru: 'Группа' }, images: { card: 'https://art.hearthstonejson.com/v1/a.png' },
    impact: CLOSED[0] }],
  pagination: { has_next: page < 2 },
});

export const state = { down: false, statsDown: false, reads: [] as string[] };
export const fetchImpl: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  state.reads.push(`${url.pathname}${url.search}`);
  assert.equal(new Headers(init?.headers).get('cookie'), null, 'no viewer cookie reaches a source');
  if (state.down) return new Response('down', { status: 500 });
  if (url.pathname === '/api/bg/library/minion-stats') {
    return state.statsDown ? new Response('down', { status: 500 }) : new Response(JSON.stringify(statsPayload()));
  }
  if (url.pathname === '/api/bg/library/cards') {
    return new Response(JSON.stringify({ data: catalogs[`${url.searchParams.get('card_type')}:${url.searchParams.get('in_pool')}`] ?? [] }));
  }
  const extra = url.pathname.match(/\/(anomalies|dark-gifts|quests|rewards|darkmoon-prizes|trinkets|timewarped-cards)$/);
  if (extra) {
    const labels: Record<string, string> = { anomalies: 'Аномалия', 'dark-gifts': 'Дар', quests: 'Квест', rewards: 'Награда',
      'darkmoon-prizes': 'Приз', trinkets: 'Аксессуар', 'timewarped-cards': 'Хрономаль' };
    return new Response(JSON.stringify(extraPage(Number(url.searchParams.get('page')), labels[extra[1]])));
  }
  return new Response('missing', { status: 404 });
};

