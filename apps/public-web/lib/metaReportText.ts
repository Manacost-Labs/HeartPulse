import { isStandardMetaPeriod } from '@/shared/standardMetaPeriods';
import { standardMetaPeriodLabel } from '@/src/features/standardMetaFilterModel';
import type { MetaReportView } from './metaReportView';
import type { ReportSection } from './publicMetaReportData';

/* Russian wording of the meta report: dates, numbers, labels of snapshot codes. */

const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «23 ноября 2026» of a `YYYY-MM-DD` report date (a calendar date, no time zone). */
export function reportDateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS_GENITIVE[month - 1]} ${year}`;
}

export const reportTitle = (date: string) => `Мета Hearthstone на ${reportDateLabel(date)}: еженедельный отчёт`;
export const reportPath = (date: string) => `/reports/meta/${date}/`;

export const decimal = (value: number, digits = 1) => value.toFixed(digits).replace('.', ',').replace('-', '−');
export const percent = (value: number | null) => (value === null ? '—' : `${decimal(value)}%`);
export const count = (value: number | null) => (value === null ? '—' : Math.round(value).toLocaleString('ru-RU'));

/** «+1,2 п.п.», «−0,4 п.п.», «0,0 п.п.» */
export function points(value: number | null): string | null {
  if (value === null) return null;
  return `${value > 0 ? '+' : ''}${decimal(value)} п.п.`;
}

const RANKS: Record<string, string> = { diamond_legend: 'Алмаз — Легенда', all: 'все ранги', legend: 'Легенда' };
export const rankLabel = (rank: string) => RANKS[rank] ?? rank;

/** «Патч 37.0.2», «Черная империя» and the like; the raw code when the site has no name for it. */
export function periodLabel(period: string | null): string | null {
  if (!period) return null;
  return isStandardMetaPeriod(period) || period.startsWith('patch_') ? standardMetaPeriodLabel(period as never) : period;
}

/** «Топ 50%» of `TOP_50_PERCENT`. */
export function mmrLabel(mmr: string | null): string | null {
  const match = mmr?.match(/^TOP_(\d{1,2})_PERCENT$/);
  return match ? `Топ ${match[1]}%` : null;
}

const SOURCES: Record<string, string> = { hsguru: 'HSGuru', hsreplay: 'HSReplay', 'api.kolodahearthstone.com': 'архив патчей api.kolodahearthstone.com' };
export const sourceLabel = (source: string | null) => (source ? SOURCES[source.toLowerCase()] ?? source : null);

const TIME = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });

/** «1 декабря 2026» of an instant, in the audience's zone. */
export const instantDateLabel = (iso: string) => reportDateLabel(DAY.format(new Date(iso)));

/** «20 ноября 2026, 02:00 МСК» of an instant, in the audience's zone. */
export function instantLabel(iso: string): string {
  const at = new Date(iso);
  return `${reportDateLabel(DAY.format(at))}, ${TIME.format(at)} МСК`;
}

/** «Данные на … · источник …» of a section, with its state when it is not fresh. */
export function sectionNote(section: ReportSection<unknown>): string {
  const source = sourceLabel(section.source);
  const parts = [
    section.updatedAt ? `Данные на ${instantLabel(section.updatedAt)}` : 'Дата данных источника неизвестна',
    source ? `источник ${source}` : null,
    section.status === 'stale' ? 'на день среза данные источника были старше 48 часов' : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** The description of a report from its own figures: the winrate leader and the most played archetype. */
export function metaReportDescription(view: Pick<MetaReportView, 'date' | 'standard'>): string {
  const best = view.standard.byWinrate[0];
  const popular = view.standard.byPopularity[0];
  const facts = [
    best ? `лидер по винрейту — ${best.name} (${percent(best.winrate)})` : null,
    popular ? `самый популярный — ${popular.name} (${percent(popular.popularity)})` : null,
  ].filter(Boolean).join(', ');
  return `Мета Hearthstone на ${reportDateLabel(view.date)}${facts ? `: ${facts}` : ''}. Стандарт, матчапы, классы Арены и герои Полей сражений.`;
}
