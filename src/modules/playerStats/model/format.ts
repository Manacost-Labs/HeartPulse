import { pluralRu } from '../../../shared/text/pluralRu';
import type { HearthstoneClass, LadderRank, StatsPeriod, WinLoss } from './stats';

export const MODE_LABELS = {
  battlegrounds: 'Поля сражений',
  standard: 'Стандарт',
  wild: 'Вольный',
  arena: 'Арена',
} as const;

export const PERIOD_OPTIONS: Array<{ value: StatsPeriod; label: string }> = [
  { value: 'all', label: 'Всё время' },
  { value: 'season', label: 'Сезон' },
  { value: '90', label: '90 дней' },
  { value: '30', label: '30 дней' },
  { value: '7', label: '7 дней' },
];

export const CLASS_LABELS: Record<HearthstoneClass, string> = {
  DEATHKNIGHT: 'Рыцарь смерти',
  DEMONHUNTER: 'Охотник на демонов',
  DRUID: 'Друид',
  HUNTER: 'Охотник',
  MAGE: 'Маг',
  PALADIN: 'Паладин',
  PRIEST: 'Жрец',
  ROGUE: 'Разбойник',
  SHAMAN: 'Шаман',
  WARLOCK: 'Чернокнижник',
  WARRIOR: 'Воин',
};

/** The site's class icon, the same files the meta and Arena pages use. */
export function classIconUrl(playerClass: HearthstoneClass): string {
  return `/class_icon/ui/${playerClass.toLowerCase()}-64.webp`;
}

const LEAGUES = ['Бронза', 'Серебро', 'Золото', 'Платина', 'Алмаз'];

/** `starLevel` 1 = Bronze 10 … 50 = Diamond 1, 51 = Legend, as the game client counts it. */
export function rankLabel(rank: LadderRank | null): string {
  if (!rank) return '—';
  if (rank.starLevel >= 51) return rank.legendRank ? `Легенда №${rank.legendRank.toLocaleString('ru-RU')}` : 'Легенда';
  const league = LEAGUES[Math.floor((rank.starLevel - 1) / 10)] ?? LEAGUES[0];
  return `${league} ${10 - ((rank.starLevel - 1) % 10)}`;
}

export function formatNumber(value: number | null, digits = 0): string {
  return value === null ? '—' : value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

export function formatSigned(value: number | null, digits = 0): string {
  if (value === null) return '—';
  const text = Math.abs(value).toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (value > 0) return `+${text}`;
  return value < 0 ? `−${text}` : text;
}

export function winrate(entry: WinLoss): number | null {
  return entry.games > 0 ? Math.round((entry.wins / entry.games) * 1000) / 10 : null;
}

/** «12 ч 40 мин», «35 мин»; hours only above ten hours to stay short in a KPI tile. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours >= 10) return `${hours.toLocaleString('ru-RU')} ч`;
  return minutes % 60 ? `${hours} ч ${minutes % 60} мин` : `${hours} ч`;
}

export function formatGameDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function pluralGames(count: number): string {
  return `${count.toLocaleString('ru-RU')} ${pluralRu(count, 'игра', 'игры', 'игр')}`;
}

/** Card render served through the site's image cache; it works for heroes and minions alike. */
export function cardImageUrl(cardId: string): string {
  return `/api/card-image/${encodeURIComponent(cardId)}/thumb.webp`;
}

/**
 * Personal minus global, with the direction that is better for the player:
 * a lower placement is better, a higher win rate or pick rate is better.
 */
export function comparison(own: number | null, global: number | null, lowerIsBetter = false) {
  if (own === null || global === null) return null;
  const delta = own - global;
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  return { delta, tone: Math.abs(delta) < 1e-9 ? 'even' as const : better ? 'better' as const : 'worse' as const };
}
