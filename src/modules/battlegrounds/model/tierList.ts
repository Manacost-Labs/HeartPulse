export type BattlegroundTierListKey = 'minions' | 'strategies' | 'spells' | 'trinkets';

export type BattlegroundTierListEntry = {
  id: BattlegroundTierListKey;
  /** Switcher label. */
  label: string;
  /** Section heading for assistive technology and search snippets. */
  title: string;
};

export const BATTLEGROUND_TIER_LISTS: readonly BattlegroundTierListEntry[] = [
  { id: 'minions', label: 'Существа', title: 'Тир-лист существ' },
  { id: 'strategies', label: 'Стратегии', title: 'Тир-лист стратегий' },
  { id: 'spells', label: 'Заклинания', title: 'Тир-лист заклинаний' },
  { id: 'trinkets', label: 'Аксессуары', title: 'Тир-лист аксессуаров' },
];

export type BattlegroundTierStat = { label: string; value: string };

type TierStatItem = {
  impact?: unknown;
  combatWinrate?: unknown;
  popularity?: unknown;
  avgPlacement?: unknown;
  totalPlayed?: unknown;
  games?: unknown;
  archetype?: unknown;
  difficulty?: unknown;
};

function metricNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseFloat(String(value).replace(/%/g, '').replace(/,/, '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function decimal(value: unknown): string | null {
  const parsed = metricNumber(value);
  return parsed === null ? null : parsed.toFixed(2).replace('.', ',');
}

function percent(value: unknown): string | null {
  const parsed = metricNumber(value);
  return parsed === null ? null : `${parsed.toFixed(1).replace('.', ',')}%`;
}

function count(value: unknown): string | null {
  const parsed = metricNumber(value);
  return parsed === null || parsed < 1 ? null : Math.round(parsed).toLocaleString('ru-RU');
}

function stat(label: string, value: string | null): BattlegroundTierStat | null {
  return value === null ? null : { label, value };
}

function present(stats: Array<BattlegroundTierStat | null>): BattlegroundTierStat[] {
  return stats.filter((entry): entry is BattlegroundTierStat => entry !== null);
}

/**
 * Card statistics of a minion or spell: the metric the tier is ranked by comes
 * first, the rest are supporting numbers. The tavern tier is left out because
 * the card art already shows it and the list has its own tavern filter.
 */
export function battlegroundTierCardStats(item: TierStatItem, list: 'minions' | 'spells'): {
  primary: BattlegroundTierStat | null;
  secondary: BattlegroundTierStat[];
} {
  if (list === 'minions') {
    return {
      primary: stat('Влияние', decimal(item.impact)),
      secondary: present([
        stat('Винрейт боёв', percent(item.combatWinrate)),
        stat('Выбор', percent(item.popularity)),
      ]),
    };
  }
  return {
    primary: stat('Среднее место', decimal(item.avgPlacement)),
    secondary: present([
      stat('Влияние', decimal(item.impact)),
      stat('Игр', count(item.totalPlayed ?? item.games)),
    ]),
  };
}

/** One quiet line under a strategy title: archetype, placement, sample and difficulty. */
export function battlegroundStrategyMetaLine(item: TierStatItem): string {
  const placement = decimal(item.avgPlacement);
  const games = count(item.games);
  return [
    String(item.archetype || '').trim(),
    placement ? `ср. место ${placement}` : '',
    games ? `${games} игр` : '',
    String(item.difficulty || '').trim().toLowerCase(),
  ].filter(Boolean).join(' · ');
}

const SOURCE_LABELS: Record<string, string> = { hsreplay: 'HSReplay', firestone: 'Firestone' };

function updatedLabel(iso: unknown): string {
  const date = new Date(String(iso || ''));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Status line of a loaded list: how many entries are shown (of how many when a
 * filter hides some), the data source and when it was refreshed.
 */
export function battlegroundTierListMetaLine({ shown, total, source, fetchedAt }: {
  shown: number;
  total: number | null;
  source?: unknown;
  fetchedAt?: unknown;
}): string {
  const rawSource = String(source || '').trim();
  return [
    total !== null && shown !== total
      ? `${shown.toLocaleString('ru-RU')} из ${total.toLocaleString('ru-RU')}`
      : shown.toLocaleString('ru-RU'),
    SOURCE_LABELS[rawSource.toLowerCase()] || rawSource,
    updatedLabel(fetchedAt),
  ].filter(Boolean).join(' · ');
}
