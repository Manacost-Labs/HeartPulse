import type {
  BattlegroundMinionBoard,
  BattlegroundMinionStats,
  BattlegroundMinionStatsTotals,
} from '../modules/battlegrounds/public';
import type { ChartPoint } from '../shared/ui/analytics/analyticsModel';
import type { KpiItem } from '../vendor/varylo-ui/data-display/KpiGroup';
// The kit's fraction-based Wilson: importing the archetype model would regroup the archetype page's chunks.
import { wilsonInterval } from '../vendor/varylo-ui/gaming/stats';

export type MinionVariant = 'normal' | 'golden';

const PERCENT: Intl.NumberFormatOptions = { style: 'percent', maximumFractionDigits: 1 };
const SIGNED: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' };
const placeFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * "на 0,20 места лучше": the KPIs keep their own signs (placement gap: with minus without,
 * lower is better; HSReplay impact: higher is better), so the caption names the direction in words.
 */
export function placeDirection(places: number): string {
  const amount = placeFormat.format(Math.abs(places));
  if (amount === placeFormat.format(0)) return 'как без него';
  return `на ${amount} места ${places > 0 ? 'лучше' : 'хуже'}`;
}

/** Header KPIs of one variant. The placement gap leads: with minus without, lower is better. */
export function minionStatsKpis(totals: BattlegroundMinionStatsTotals | null): KpiItem[] {
  if (!totals) return [];
  const { placementWith: withMinion, placementWithout: without } = totals;
  const items: KpiItem[] = [];
  if (withMinion !== null && without !== null) {
    items.push({
      id: 'placement',
      label: 'Место с ним и без',
      value: withMinion - without,
      format: SIGNED,
      caption: placeDirection(without - withMinion),
    });
  }
  if (totals.combatWinrate !== null) items.push({ id: 'combat', label: 'Винрейт боёв', value: totals.combatWinrate / 100, format: PERCENT });
  if (totals.popularity !== null) items.push({ id: 'popularity', label: 'Популярность', value: totals.popularity / 100, format: PERCENT });
  if (totals.impact !== null) items.push({ id: 'impact', label: 'Влияние', value: totals.impact, format: SIGNED, caption: placeDirection(totals.impact) });
  items.push({ id: 'games', label: 'Игры', value: totals.gamesWith, format: { maximumFractionDigits: 0 } });
  return items;
}

/** A gap under 0.05 of a place rounds to zero on screen, so it stays neutral. */
export function minionPlacementTone(totals: BattlegroundMinionStatsTotals | null): 'better' | 'worse' | null {
  if (totals?.placementWith == null || totals.placementWithout == null) return null;
  const gap = totals.placementWith - totals.placementWithout;
  return gap <= -0.05 ? 'better' : gap >= 0.05 ? 'worse' : null;
}

export type MinionRoundCharts = { winrate: ChartPoint[]; impact: ChartPoint[]; median: ChartPoint[] | null };

/**
 * Per-round series of one variant. Winrate carries a 95% Wilson band over its
 * combats; a round below the source threshold stays a gap. Median stats are
 * drawn only when they change across sampled rounds, otherwise they say nothing.
 */
export function minionRoundCharts(stats: BattlegroundMinionStats, variant: MinionVariant): MinionRoundCharts {
  const rounds = stats.rounds;
  const base = (round: number) => ({ x: round, label: `Ход ${round}`, tick: String(round) });
  const winrate = rounds.map(({ round, ...row }) => {
    const stat = row[variant];
    const combats = stat ? stat.wins + stat.losses : 0;
    const value = stat?.combatWinrate ?? null;
    const [low, high] = value === null ? [null, null] : wilsonInterval(value / 100, combats).map(bound => bound * 100);
    return { ...base(round), y: value, low, high, detail: value === null ? undefined : `${combats.toLocaleString('ru-RU')} боёв` };
  });
  const impact = rounds.map(({ round, ...row }) => ({
    ...base(round),
    y: row[variant]?.impact ?? null,
    detail: row[variant]?.popularity == null ? undefined : `на столе в ${row[variant]?.popularity?.toLocaleString('ru-RU')}% игр`,
  }));
  // A median of a round below the sample threshold is noise (one 8/1 board on turn 16).
  const medians = rounds.map(({ round, median, ...row }) => ({ round, value: row[variant] ? median[variant] : null }));
  const attacks = medians.flatMap(({ value }) => value ? [value[0]] : []);
  const varies = attacks.length > 1 && Math.max(...attacks) > Math.min(...attacks);
  const median = varies
    ? medians.map(({ round, value }) => ({ ...base(round), y: value?.[0] ?? null, detail: value ? `${value[0]}/${value[1]}` : undefined }))
    : null;
  return {
    winrate: winrate.some(point => point.y !== null) ? winrate : [],
    impact: impact.some(point => point.y !== null) ? impact : [],
    median,
  };
}

export const PURCHASE_ROWS = ['1-я копия', '2-я копия', '3-я копия', 'Раскопка'] as const;

/** Purchase heat rows by recruitment round; NaN marks a round below 30 offers. */
export function minionPurchaseMatrix(stats: BattlegroundMinionStats): { columns: string[]; values: number[][] } | null {
  const purchases = stats.purchases;
  const rows = [
    purchases.map(row => row.copies[0]),
    purchases.map(row => row.copies[1]),
    purchases.map(row => row.copies[2]),
    purchases.map(row => row.discover[0]),
  ];
  if (!rows.some(row => row.some(value => value !== null))) return null;
  return {
    columns: purchases.map(row => `Ход ${row.round}`),
    values: rows.map(row => row.map(value => value ?? Number.NaN)),
  };
}

export type BoardSlotView = { position: number; popularity: number | null; impact: number | null; heat: number };

/** Seven slots left to right; heat is the slot's share relative to the most common slot. */
export function minionBoardSlots(board: BattlegroundMinionBoard | null): BoardSlotView[] {
  if (!board) return [];
  const byPosition = new Map(board.slots.map(slot => [slot.position, slot]));
  const top = Math.max(0, ...board.slots.map(slot => slot.popularity ?? 0));
  return Array.from({ length: 7 }, (_, offset) => {
    const slot = byPosition.get(offset + 1);
    const popularity = slot?.popularity ?? null;
    return { position: offset + 1, popularity, impact: slot?.impact ?? null, heat: top > 0 && popularity !== null ? popularity / top : 0 };
  });
}

const MMR_LABELS: Record<string, string> = {
  ALL: 'все игроки', TOP_50_PERCENT: 'MMR топ-50%', TOP_20_PERCENT: 'MMR топ-20%',
};
const PERIOD_LABELS: Record<string, string> = {
  LAST_7_DAYS: '7 дней', CURRENT_BATTLEGROUNDS_PATCH: 'текущий патч',
};

/** One quiet line under the stats: source, slice and date of the newest upstream table. */
export function minionStatsSourceLine(stats: BattlegroundMinionStats, timeZone?: string): string {
  const date = stats.slice.updatedAt ?? stats.slice.fetchedAt;
  const parts = [
    'HSReplay',
    MMR_LABELS[stats.slice.mmr] ?? stats.slice.mmr,
    PERIOD_LABELS[stats.slice.period] ?? stats.slice.period,
  ];
  if (date) parts.push(`обновлено ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone }).format(new Date(date))}`);
  return parts.join(' · ');
}
