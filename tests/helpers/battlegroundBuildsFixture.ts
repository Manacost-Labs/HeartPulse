// The Battlegrounds tier list (`/api/bg/tier-lists?list=strategies&source=`) as the BG service answers it,
// for both sources of the open builds. Every closed figure is unique so a test can look for it in any
// output: sample sizes, first-place and top-four shares, the distribution, the confidence interval, other
// rating ranges, trinkets by range, the fork analysis and the card-level figures. The open average place
// is stored with four digits (`3.7777`): the projection rounds it, so the raw value must never appear.

export const UPDATED_AT = '2026-11-19T06:00:17.742755+00:00';
export const BUILD_COUNT = 5;
type Row = Record<string, unknown>;
export type BuildSource = 'hsreplay' | 'firestone';

const TIERS = ['S', 'S', 'A', 'A', 'B'];

function card(id: number, role: 'CORE' | 'ADDON'): Row {
  return {
    id: `BG_SENT_${id}`, dbfId: 90000 + id, name: `Minion ${id}`, ruName: `Существо ${id}`, localizedName: `Существо ${id}`, role,
    card: `https://api.kolodahearthstone.com/uploads/cards/BG_SENT_${id}.png`,
    frame: `https://api.kolodahearthstone.com/uploads/framed/BG_SENT_${id}.png`,
    ruText: `Текст существа ${id}`, tavernTier: 3,
    // Card-level figures a source may carry: closed.
    impact: 8.8888 + id / 1000, combatWinrate: 6.6666 + id / 1000, totalPlayed: 9191919 + id,
  };
}

function build(index: number, source: BuildSource): Row {
  const base = index * 10;
  const core = [card(base + 1, 'CORE'), card(base + 2, 'CORE')];
  const extra = [card(base + 3, 'ADDON'), card(base + 4, 'ADDON'), card(base + 1, 'ADDON')];
  return {
    key: `fx-${source}-${index}`, source: source === 'hsreplay' ? 'HSReplay' : 'Firestone', sourceKey: source, tier: TIERS[index],
    title: `Сборка ${index} ${source}`, description: `Условия перехода в сборку ${index}`, difficulty: 'Средняя', archetype: `Архетип ${index}`,
    avgPlacement: source === 'firestone' ? 3.7777 + index / 10 : null,
    popularity: source === 'firestone' ? `${(11.26 + index).toFixed(2)}` : '',
    url: `https://example.test/comps/${index}`,
    coreCards: core, additionalCards: extra, cards: [...core, ...extra],
    // Closed: single-place shares, popularity of the top four, other ranges, trinkets, forks.
    games: 7771771 + index, firstPlace: `33.3333${index}`, popularity_top_4: 44.4444 + index / 1000, avg_placement: 3.7777,
    placement_distribution: [11.1111, 12.2222, 13.3333, 14.4444, 15.5555, 16.6666, 17.7777, 18.8888].map(value => value + index / 1000),
    confidence_interval: 0.0909 + index / 10000, whenToCommit: `SENTINEL_WHEN_TO_COMMIT_${index}`,
    mmrRanges: { TOP_1_PERCENT: { avgPlacement: 2.1357 + index / 10000, games: 1357913 + index }, TOP_5_PERCENT: { avgPlacement: 2.4682 + index / 10000 } },
    trinkets: [{ name: `SENTINEL_TRINKET_${index}`, avgPlacement: 5.5555 + index / 10000 }],
    forks: [{ title: `SENTINEL_FORK_${index}`, text: `SENTINEL_FORK_TEXT_${index}` }],
  };
}

export function buildSourcePayload(source: BuildSource): Row {
  const rows = Array.from({ length: BUILD_COUNT }, (_, index) => build(index, source));
  const tiers: Record<string, Row[]> = { S: [], A: [], B: [], C: [], D: [] };
  for (const row of rows) tiers[row.tier as string].push(row);
  // Rows the page must skip: no key minion, an unusable key, a repeated key.
  tiers.C.push({ ...build(7, source), coreCards: [] });
  tiers.D.push({ ...build(8, source), key: 'bad key!' });
  tiers.B.push({ ...rows[0], tier: 'B' });
  return {
    list: 'strategies', label: 'Тир-лист стратегий', source, upstreamSource: 'fixture', fetchedAt: UPDATED_AT,
    generatedAt: '2026-11-19T15:08:31.778Z', tier: null, availableTiers: ['S', 'A', 'B'], count: rows.length, tiers,
    tierCounts: { S: 2, A: 2, B: 1, C: 0, D: 0 },
    mmr: 'TOP_1_PERCENT_SENTINEL', dataStatus: 'SENTINEL_DATA_STATUS',
  };
}

export const sourceOf = (list: 'compositions' | 'strategies'): BuildSource => list === 'compositions' ? 'hsreplay' : 'firestone';

/** What the open projection must say about the fixture, in page order. */
export function OPEN_BUILDS(list: 'compositions' | 'strategies') {
  const source = sourceOf(list);
  return Array.from({ length: BUILD_COUNT }, (_, index) => ({
    key: `fx-${source}-${index}`, tier: TIERS[index], title: `Сборка ${index} ${source}`, description: `Условия перехода в сборку ${index}`,
    difficulty: 'Средняя', archetype: `Архетип ${index}`,
    avgPlacement: source === 'firestone' ? Number((3.7777 + index / 10).toFixed(2)) : null,
    popularity: source === 'firestone' ? Number((11.26 + index).toFixed(1)) : null,
    core: [`Существо ${index * 10 + 1}`, `Существо ${index * 10 + 2}`],
    extra: [`Существо ${index * 10 + 3}`, `Существо ${index * 10 + 4}`],
  }));
}

const CLOSED_KEYS = ['games', 'firstPlace', 'popularity_top_4', 'avg_placement', 'placement_distribution', 'confidence_interval',
  'whenToCommit', 'mmrRanges', 'trinkets', 'forks'];
const CLOSED_CARD_KEYS = ['impact', 'combatWinrate', 'totalPlayed'];

function leaves(value: unknown, out: string[]): string[] {
  if (Array.isArray(value)) value.forEach(item => leaves(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => leaves(item, out));
  else if (value !== null && value !== undefined && value !== '') out.push(String(value));
  return out;
}

/** Every closed value of the fixture (both sources) as the text a leak would print. */
export function closedValues(): string[] {
  const values = new Set<string>(['3.7777', 'TOP_1_PERCENT_SENTINEL', 'SENTINEL_DATA_STATUS']);
  for (const source of ['hsreplay', 'firestone'] as const) {
    const payload = buildSourcePayload(source) as { tiers: Record<string, Row[]> };
    for (const row of Object.values(payload.tiers).flat()) {
      for (const key of CLOSED_KEYS) leaves(row[key], []).forEach(text => values.add(text));
      for (const item of [...(row.coreCards as Row[]), ...(row.additionalCards as Row[])]) {
        for (const key of CLOSED_CARD_KEYS) leaves(item[key], []).forEach(text => values.add(text));
      }
    }
  }
  return [...values];
}
