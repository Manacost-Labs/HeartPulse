import type {
  LiveStream, StreamerDeck, StreamerFacet, StreamerFilters, StreamerFormat, StreamerLadder, StreamerPage, StreamersFilters, StreamersPage,
} from './types';

export const STREAMER_CLASS_LABELS: Readonly<Record<string, string>> = {
  deathknight: 'Рыцарь смерти', demonhunter: 'Охотник на демонов', druid: 'Друид', hunter: 'Охотник', mage: 'Маг',
  paladin: 'Паладин', priest: 'Жрец', rogue: 'Разбойник', shaman: 'Шаман', warlock: 'Чернокнижник', warrior: 'Воин',
};

export const STREAMER_FORMAT_LABELS: Readonly<Record<StreamerFormat, string>> = {
  standard: 'Стандарт', wild: 'Вольный', classic: 'Классика', twist: 'Твист',
};

const MODE_LABELS: Readonly<Record<string, string>> = {
  ...STREAMER_FORMAT_LABELS, battlegrounds: 'Поля сражений', arena: 'Арена', mercenaries: 'Наёмники', duels: 'Дуэли',
  tavern_brawl: 'Потасовка', fireside_gathering: 'Встреча у камина',
};

export const DEFAULT_STREAMER_FILTERS: StreamerFilters = { format: null, classKey: null };
export const DEFAULT_STREAMERS_FILTERS: StreamersFilters = { ...DEFAULT_STREAMER_FILTERS, language: null, live: false, query: null, sort: 'active' };
/** Эфиров на экране до «Показать все». */
export const LIVE_PREVIEW_COUNT = 8;

export function streamerClassIcon(classKey: string | null): string {
  return classKey ? `/class_icon/ui/${classKey}-64.webp` : '/class_icon/neutral.webp';
}

export function streamModeLabel(mode: string | null): string | null {
  return mode ? MODE_LABELS[mode] ?? null : null;
}

const NUMBER = new Intl.NumberFormat('ru-RU');
const COMPACT = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
// Москва: сервер и браузер рисуют одинаковые даты, и гидратация не расходится.
const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' });
const DATE_TIME = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const TIME = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

export function formatCount(value: number | null): string | null {
  return value === null ? null : NUMBER.format(value);
}

export function formatFollowers(value: number | null): string | null {
  return value === null ? null : `${COMPACT.format(value)} ${plural(value, 'фолловер', 'фолловера', 'фолловеров')}`;
}

export function formatViewers(value: number | null): string | null {
  return value === null ? null : `${NUMBER.format(value)} ${plural(value, 'зритель', 'зрителя', 'зрителей')}`;
}

export function formatPlayedAt(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

export function formatPlayedDay(iso: string): string {
  return DATE.format(new Date(iso));
}

export function formatLiveSince(iso: string | null): string | null {
  return iso ? `с ${TIME.format(new Date(iso))} мск` : null;
}

export function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «#468» — пик Легенды; вне Легенды ранга нет. */
export function deckRankLabel(deck: Pick<StreamerDeck, 'peakRank'>): string | null {
  return deck.peakRank ? `#${NUMBER.format(deck.peakRank)}` : null;
}

export function deckRecord(deck: Pick<StreamerDeck, 'wins' | 'losses'>): { text: string; winrate: number | null } | null {
  if (deck.wins === null && deck.losses === null) return null;
  const wins = deck.wins ?? 0;
  const losses = deck.losses ?? 0;
  const games = wins + losses;
  return { text: `${wins}–${losses}`, winrate: games ? Math.round((100 * wins) / games) : null };
}

/** Карточка стримера: разные архетипы, а не три сборки одного. */
export function distinctRecentDecks(decks: StreamerDeck[], limit = 3): StreamerDeck[] {
  const seen = new Set<string>();
  return decks.filter(deck => {
    const key = `${deck.format}|${deck.archetype}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

/** Два-три класса, которыми стример играет чаще всего среди последних колод. */
export function favoriteClasses(decks: Pick<StreamerDeck, 'classKey'>[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const deck of decks) if (deck.classKey) counts.set(deck.classKey, (counts.get(deck.classKey) ?? 0) + 1);
  // Map хранит порядок первой встречи: при равенстве выше класс более свежей колоды.
  return [...counts].sort((left, right) => right[1] - left[1]).slice(0, limit).map(([classKey]) => classKey);
}

/** Лучший ранг в карточке, если его ещё не видно в строках колод (одно число — один раз). */
export function cardBestRank(bestRank: number | null, shown: Pick<StreamerDeck, 'peakRank'>[]): string | null {
  return bestRank && !shown.some(deck => deck.peakRank === bestRank) ? `#${NUMBER.format(bestRank)}` : null;
}

const MONTH = new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' });

/** «#457 · EU» и подсказка: текущий сезон или итог прошлого («сентябрь»). */
export function ladderLabel(ladder: StreamerLadder | null): { text: string; title: string } | null {
  if (!ladder) return null;
  const mode = ladder.mode === 'wild' ? 'Вольный' : 'Стандарт';
  const text = `#${NUMBER.format(ladder.rank)} · ${ladder.region}`;
  if (ladder.current) return { text, title: `Место сейчас в таблице лидеров Blizzard, ${mode}, ${ladder.region}` };
  const month = ladder.seasonStart ? MONTH.format(new Date(`${ladder.seasonStart}T00:00:00Z`)) : null;
  return {
    text: month ? `${text} · ${month}` : text,
    title: `Итоговое место в таблице лидеров Blizzard${month ? ` за ${month}` : ''}, ${mode}, ${ladder.region}`,
  };
}

/** «5:41:20» из ссылки на запись `?t=5h41m20s`. */
export function vodTimecode(url: string): string | null {
  let raw: string | null;
  try {
    raw = new URL(url).searchParams.get('t');
  } catch {
    return null;
  }
  const match = raw ? /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw) : null;
  if (!match || !raw) return null;
  const [hours, minutes, seconds] = match.slice(1).map(part => Number(part ?? 0));
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Поиск по нику: только символы, которые принимает `/api/streamers?q=`, не длиннее 40. */
export function streamerSearchQuery(text: string): string | null {
  return text.replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40).trim() || null;
}

/** Русские эфиры, если зритель попросил только их. */
export function visibleLiveStreams(streams: LiveStream[], russianOnly: boolean): LiveStream[] {
  return russianOnly ? streams.filter(stream => stream.language === 'ru') : streams;
}

export type FacetOption<T> = { value: T; label: string; decks: number };

/** Форматы и классы, в которых у стримера есть колоды, с числом колод. */
export function streamerFacetOptions(facets: StreamerFacet[], filters: StreamerFilters) {
  const formats = new Map<StreamerFormat, number>();
  const classes = new Map<string, number>();
  for (const facet of facets) {
    formats.set(facet.format, (formats.get(facet.format) ?? 0) + facet.decks);
    if (facet.classKey && (!filters.format || facet.format === filters.format)) {
      classes.set(facet.classKey, (classes.get(facet.classKey) ?? 0) + facet.decks);
    }
  }
  const formatOptions: FacetOption<StreamerFormat>[] = (Object.keys(STREAMER_FORMAT_LABELS) as StreamerFormat[])
    .filter(format => formats.has(format))
    .map(format => ({ value: format, label: STREAMER_FORMAT_LABELS[format], decks: formats.get(format) ?? 0 }));
  const classOptions: FacetOption<string>[] = [...classes]
    .sort((left, right) => right[1] - left[1])
    .map(([classKey, decks]) => ({ value: classKey, label: STREAMER_CLASS_LABELS[classKey] ?? classKey, decks }));
  return { formats: formatOptions, classes: classOptions };
}

/** Строка запроса фильтров для `/api/streamers*`; значения по умолчанию не пишутся. */
export function streamerFilterQuery(filters: StreamerFilters & Partial<StreamersFilters>, offset = 0): string {
  const query = new URLSearchParams();
  if (filters.format) query.set('format', filters.format);
  if (filters.classKey) query.set('class', filters.classKey);
  if (filters.language) query.set('lang', filters.language);
  if (filters.live) query.set('live', '1');
  if (filters.query) query.set('q', filters.query);
  if (filters.sort && filters.sort !== 'active') query.set('sort', filters.sort);
  if (offset) query.set('offset', String(offset));
  const text = query.toString();
  return text ? `?${text}` : '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isStreamersPage(value: unknown): value is StreamersPage {
  return isObject(value) && Array.isArray(value.live) && Array.isArray(value.streamers)
    && typeof value.total === 'number' && typeof value.offset === 'number' && isObject(value.filters);
}

export function isStreamerPage(value: unknown): value is StreamerPage {
  return isObject(value) && isObject(value.streamer) && typeof value.streamer.slug === 'string'
    && Array.isArray(value.decks) && typeof value.total === 'number' && isObject(value.filters);
}
