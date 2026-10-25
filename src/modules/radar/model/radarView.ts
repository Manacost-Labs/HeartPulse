import type { RadarCandidate, RadarClassKey, RadarKind, RadarReport, RadarSentiment, RadarStance } from './types';

export type {
  RadarBacktest, RadarCandidate, RadarChangeItem, RadarChanges, RadarClassKey, RadarForecast, RadarHistory, RadarKind, RadarPattern,
  RadarPost, RadarPrecedent, RadarPredictedChange, RadarReport, RadarTrendPoint,
} from './types';

export type RadarSectionId = 'nerfs' | 'buffs';

export const RADAR_SECTIONS: Record<RadarSectionId, { title: string; empty: string }> = {
  nerfs: { title: 'Радар нерфов', empty: 'Сейчас радар не видит кандидатов на ослабление.' },
  buffs: { title: 'Радар баффов', empty: 'Сейчас радар не видит кандидатов на усиление.' },
};

export const RADAR_CLASS_LABELS: Record<RadarClassKey, string> = {
  deathknight: 'Рыцарь смерти', demonhunter: 'Охотник на демонов', druid: 'Друид', hunter: 'Охотник', mage: 'Маг',
  paladin: 'Паладин', priest: 'Жрец', rogue: 'Разбойник', shaman: 'Шаман', warlock: 'Чернокнижник', warrior: 'Воин',
  neutral: 'Нейтральная',
};

export const RADAR_KIND_LABELS: Record<RadarKind, string> = { card: 'Карта', archetype: 'Архетип', class: 'Класс' };

export const RADAR_SENTIMENT_LABELS: Record<RadarSentiment, string | null> = {
  negative: 'Негативное настроение', mixed: 'Смешанное настроение', neutral: 'Спокойное настроение',
  positive: 'Позитивное настроение', no_data: null,
};

export const RADAR_STANCE_LABELS: Record<RadarStance, string | null> = {
  wants_nerf: 'просят нерф', wants_buff: 'просят бафф', divided: 'мнения разделились', indifferent: 'претензий нет', no_data: null,
};

export type RadarConfidenceLevel = 'high' | 'medium' | 'low';

/** Пороги уровней уверенности; фильтры «от 50» и «от 75» используют те же границы. */
export const RADAR_CONFIDENCE_LEVELS: Record<RadarConfidenceLevel, { min: number; label: string }> = {
  high: { min: 75, label: 'Высокая' },
  medium: { min: 50, label: 'Средняя' },
  low: { min: 0, label: 'Низкая' },
};

export function radarConfidenceLevel(confidence: number): RadarConfidenceLevel {
  if (confidence >= RADAR_CONFIDENCE_LEVELS.high.min) return 'high';
  return confidence >= RADAR_CONFIDENCE_LEVELS.medium.min ? 'medium' : 'low';
}

export type RadarFilters = {
  classKey: RadarClassKey | 'all';
  kind: RadarKind | 'all';
  minConfidence: 0 | 50 | 75;
};

export const DEFAULT_RADAR_FILTERS: RadarFilters = { classKey: 'all', kind: 'all', minConfidence: 0 };

export function filterRadarCandidates(candidates: readonly RadarCandidate[], filters: RadarFilters): RadarCandidate[] {
  return candidates.filter(candidate => (filters.classKey === 'all' || candidate.entity.classKey === filters.classKey)
    && (filters.kind === 'all' || candidate.kind === filters.kind)
    && candidate.confidence >= filters.minConfidence);
}

/**
 * Классы обоих разделов, чтобы выбранный класс не пропадал из списка при
 * переключении «нерфы ↔ баффы». Нейтральные карты идут последними.
 */
export function radarClassOptions(report: Pick<RadarReport, 'nerfs' | 'buffs'>): RadarClassKey[] {
  const keys = new Set([...report.nerfs, ...report.buffs].map(candidate => candidate.entity.classKey));
  return [...keys].sort((a, b) => (a === 'neutral' ? 1 : b === 'neutral' ? -1
    : RADAR_CLASS_LABELS[a].localeCompare(RADAR_CLASS_LABELS[b], 'ru')));
}

/** Миниатюра карты для карты, иконка класса для архетипа и класса. */
export function radarEntityImage(candidate: RadarCandidate): string {
  if (candidate.kind === 'card') return `/api/card-image/${encodeURIComponent(candidate.entity.id)}/thumb.webp`;
  return radarClassIcon(candidate.entity.classKey);
}

export function radarClassIcon(classKey: RadarClassKey): string {
  return classKey === 'neutral' ? '/class_icon/neutral.webp' : `/class_icon/ui/${classKey}-64.webp`;
}

/**
 * Проверка формы ответа `/api/radar` перед показом: Express уже разобрал
 * данные hs-data-api, но ответ `200` другой формы (ошибка прокси, старая
 * версия) не должен ронять страницу.
 */
export function isRadarReport(value: unknown): value is RadarReport {
  const report = value as RadarReport | null;
  return Boolean(report) && typeof report?.generatedAt === 'string' && typeof report.summary === 'string'
    && Array.isArray(report.nerfs) && Array.isArray(report.buffs)
    && typeof report.demo === 'boolean';
}

/**
 * Длинный вывод модели делится на короткое начало (первые предложения) и
 * остаток абзацами, который страница прячет под «Подробнее».
 */
export function radarLead(text: string, sentences = 2): { lead: string; rest: string[] } {
  const paragraphs = text.split(/\n\s*\n|\n/).map(paragraph => paragraph.trim()).filter(Boolean);
  const first = (paragraphs[0] ?? '').split(/(?<=[.!?…])\s+(?=[«"(]?[А-ЯЁA-Z0-9])/);
  return {
    lead: first.slice(0, sentences).join(' '),
    rest: [first.slice(sentences).join(' '), ...paragraphs.slice(1)].filter(Boolean),
  };
}

const percentFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MOSCOW_OFFSET_MS = 3 * 60 * 60_000;

/** Разряды через неразрывный пробел, как в остальных таблицах сайта. */
export function formatRadarCount(value: number | null): string {
  return value === null ? '—' : String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatRadarPercent(value: number | null): string {
  return value === null ? '—' : `${percentFormat.format(value)}%`;
}

/**
 * Даты собираются вручную по московскому времени (UTC+3 без перехода на
 * летнее): `Intl` с часами форматирует по-разному в Node и браузерах, и
 * гидратация разошлась бы с HTML сервера.
 */
function moscow(iso: string): Date | null {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time + MOSCOW_OFFSET_MS) : null;
}

export function formatRadarDay(iso: string | null): string | null {
  const day = iso ? moscow(iso) : null;
  return day ? `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}` : null;
}

/** Дата с годом: прошлые патчи бывают и прошлогодними. */
export function formatRadarDate(iso: string | null): string | null {
  const day = iso ? moscow(iso) : null;
  return day ? `${formatRadarDay(iso)} ${day.getUTCFullYear()}` : null;
}

export function formatRadarTime(iso: string): string {
  const time = moscow(iso);
  if (!time) return '—';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${formatRadarDay(iso)}, ${pad(time.getUTCHours())}:${pad(time.getUTCMinutes())} МСК`;
}

/**
 * Сдвиг популярности за сутки к основному периоду статистики, в п. п.:
 * «+8,4 п. п. за сутки», если основной период длиннее суток.
 */
export function radarDayShift(stats: RadarCandidate['stats']): number | null {
  const day = stats.trend.find(point => point.label === 'Сутки');
  const main = stats.trend.find(point => point.label === stats.periodLabel);
  if (!day || !main || day === main) return null;
  return radarTrendDelta(day.popularity, main.popularity);
}

/** Изменение между соседними значениями, в процентных пунктах. */
export function radarTrendDelta(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : Math.round((current - previous) * 10) / 10;
}

export function formatRadarDelta(value: number): string {
  if (value === 0) return '±0';
  return `${value > 0 ? '+' : '−'}${percentFormat.format(Math.abs(value))}`;
}
