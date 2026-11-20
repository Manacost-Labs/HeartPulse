// The Battlegrounds hero catalog as the BG service answers it, with a stub per rating range. Every
// closed figure is unique so a test can look for it in any output: the other ranges
// (TOP_20/5/1_PERCENT), the single places of the placement distribution, the adjusted placement,
// and per-patch history that the source does not carry today but may add.

export const UPDATED_AT = '2026-11-18T17:01:18.663532+00:00';
export const HERO_COUNT = 6;
type Row = Record<string, unknown>;

const RANGE_MARKS: Record<string, { avg: string; dist: number; adjusted: number; pick: string }> = {
  TOP_20_PERCENT: { avg: '4.2001', dist: 21.2001, adjusted: 3.2001, pick: '21.2001%' },
  TOP_5_PERCENT: { avg: '4.5001', dist: 22.5001, adjusted: 3.5001, pick: '22.5001%' },
  TOP_1_PERCENT: { avg: '4.4321', dist: 12.3456, adjusted: 3.9876, pick: '23.4321%' },
};

function hero(index: number, range: string, mode: string): Row {
  const base = range === 'TOP_50_PERCENT';
  const marks = RANGE_MARKS[range];
  const id = 1000 + index;
  const open = {
    hero: `Герой ${index}`,
    dbfId: id,
    id: `BG_SENT_HERO_${index}`,
    tier: ['A', 'B', 'B', 'C', 'C', 'D'][index],
    image: `https://hearthstone.wiki.gg/images/BG_SENT_HERO_${index}.png`,
    hero_power: { dbf: id + 1, card: { name: `Сила ${index}`, text: `Текст силы ${index}`, image: `https://art.hearthstonejson.com/v1/bgs/latest/ruRU/512x/BG_SENT_HERO_${index}p.png` } },
    best_composition: { id: 7, name: `Сборка ${index}` },
    key_minions_top3: [{ name: `Существо ${index}a` }, { name: `Существо ${index}b` }],
  };
  // Stored out of order on purpose: the order of the table comes from the average place.
  const place = 3.21 + index * 0.37;
  if (base) {
    return {
      ...open,
      avg_placement: mode === 'duos' ? place : place.toFixed(2),
      pick_rate: `${(10.5 + index).toFixed(2)}%`,
      // Eight places (solo) or four (duos); every single place is closed, only the top-4 sum is open.
      placement_distribution: Array.from({ length: mode === 'duos' ? 4 : 8 }, (_, k) => `${(12.3456 + k * 0.0111 + index * 0.0001 + 0.0002).toFixed(4)}%`),
      adjusted_avg_placement: Number((3.9876 + index * 0.0001).toFixed(4)),
      anomaly_adjusted: index === 2,
      by_patch: [{ patch: `SENTINEL_PATCH_${index}`, avg_placement: Number((4.5555 + index * 0.0001).toFixed(4)) }],
      history: [{ date: `2026-09-${10 + index}`, avg_placement: Number((4.6666 + index * 0.0001).toFixed(4)) }],
      ranges: Object.fromEntries(Object.entries(RANGE_MARKS).map(([name, mark]) => [name, { avg_placement: mark.avg, pick_rate: mark.pick }])),
    };
  }
  return {
    ...open, avg_placement: marks.avg + index, pick_rate: marks.pick,
    placement_distribution: Array.from({ length: 8 }, (_, k) => `${(marks.dist + k * 0.0003 + index * 0.00001).toFixed(5)}%`),
    adjusted_avg_placement: marks.adjusted + index / 10_000,
  };
}

/** `unrated` heroes have no tier or place yet, as in the live catalog. */
export function buildHeroCatalog(range: string, mode: string): Row {
  const heroes = [3, 0, 5, 1, 4, 2].map(index => hero(index, range, mode));
  heroes.push({ hero: 'Без оценки', dbfId: 2001, id: 'BG_SENT_UNRATED', tier: null, avg_placement: null, pick_rate: '1.00%', placement_distribution: [] });
  return { ok: true, fetched_at: UPDATED_AT, site: 'hsreplay', view: { heroes, filters: { mmr_percentile: range } } };
}

/** What the open table says, best (lowest) average place first. */
export const OPEN_ROWS = (mode: string) => [0, 1, 2, 3, 4, 5].map(index => {
  const place = 3.21 + index * 0.37;
  const distribution = Array.from({ length: 8 }, (_, k) => Number((12.3456 + k * 0.0111 + index * 0.0001 + 0.0002).toFixed(4)));
  return {
    dbfId: 1000 + index,
    name: `Герой ${index}`,
    tier: ['A', 'B', 'B', 'C', 'C', 'D'][index],
    avgPlacement: Number(place.toFixed(2)),
    top4Rate: mode === 'duos' ? null : Number(distribution.slice(0, 4).reduce((sum, value) => sum + value, 0).toFixed(1)),
    pickRate: Number((10.5 + index).toFixed(2)),
  };
});

/** The figures and words that must never reach a guest's page or the open JSON. */
export function closedValues(): string[] {
  const values = ['SENTINEL_PATCH', 'adjusted_avg_placement', 'placement_distribution', 'anomaly_adjusted', 'TOP_20_PERCENT', 'TOP_5_PERCENT', 'TOP_1_PERCENT'];
  for (const range of ['TOP_50_PERCENT', ...Object.keys(RANGE_MARKS)]) {
    for (const mode of ['solo', 'duos']) {
      for (const row of ((buildHeroCatalog(range, mode).view as { heroes: Row[] }).heroes)) {
        const closed = range === 'TOP_50_PERCENT'
          ? [row.placement_distribution, row.adjusted_avg_placement, row.by_patch, row.history, row.ranges]
          : [row];
        JSON.stringify(closed).match(/\d+\.\d{4,}%?|SENTINEL_PATCH_\d/g)?.forEach(value => values.push(value));
        if (range !== 'TOP_50_PERCENT') values.push(String(row.avg_placement), String(row.pick_rate));
      }
    }
  }
  return [...new Set(values)].filter(value => value !== 'null' && value !== 'undefined');
}
