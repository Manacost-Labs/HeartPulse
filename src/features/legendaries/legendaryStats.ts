import type { LegendaryGroup, LegendaryPaidMetrics } from '../../modules/arenaLegendaries/public';

export type LegendaryPaidKey = 'offerRate' | 'score';
export type LegendarySortKey = 'winRate' | 'pickRate' | LegendaryPaidKey;

export const LEGENDARY_SORT_OPTIONS: Array<{ id: LegendarySortKey; label: string }> = [
  { id: 'winRate', label: 'Винрейт' },
  { id: 'pickRate', label: 'Частота выбора' },
  { id: 'offerRate', label: 'Частота предложения' },
  { id: 'score', label: 'Оценка ArenaSmith' },
];

/** The paid columns: the name and what it tells, shown to everyone; the value only to a subscriber. */
export const LEGENDARY_PAID_COLUMNS: Record<LegendaryPaidKey, { label: string; hint: string }> = {
  offerRate: { label: 'Частота предложения', hint: 'Как часто группу предлагают игрокам на драфте' },
  score: { label: 'Оценка ArenaSmith', hint: 'Оценка силы группы по данным ArenaSmith' },
};

export const isPaidSort = (key: LegendarySortKey): key is LegendaryPaidKey => key === 'offerRate' || key === 'score';

/** A source without the figure has it for nobody: the flag, not the viewer, decides «Нет данных». */
export const paidAvailable = (flags: LegendaryPaidMetrics | undefined, key: LegendaryPaidKey) => flags?.[key] !== false;

export function legendaryGroupStats(group: LegendaryGroup, activeClass = 'all') {
  const classStats = activeClass !== 'all' ? group.byClass?.[activeClass] : (group.byClass?.all ?? null);
  return {
    winRate: classStats?.winRate ?? group.winRate,
    pickRate: classStats?.pickRate ?? group.pickRate ?? group.keyCard.pickRate ?? null,
    offerRate: classStats?.offerRate ?? group.offerRate ?? group.keyCard.offerRate ?? null,
    score: classStats?.score ?? group.score ?? group.keyCard.arenaScore ?? null,
  };
}

export function formatLegendaryStat(value: number | null | undefined, kind: 'pct' | 'score'): string {
  if (value == null || !Number.isFinite(value)) return 'Нет данных';
  if (kind === 'score') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${value.toFixed(1)}%`;
}

export function legendarySortValue(group: LegendaryGroup, key: LegendarySortKey, activeClass = 'all'): number {
  const raw = legendaryGroupStats(group, activeClass)[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : Number.NEGATIVE_INFINITY;
}

const MOSCOW_DATE = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit',
  year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Moscow time, as the other open pages print it: the same text on the server and in the browser. */
export function formatLegendaryDate(iso: string | null): string | null {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  return `${MOSCOW_DATE.format(new Date(iso)).replace(',', '')} МСК`;
}
