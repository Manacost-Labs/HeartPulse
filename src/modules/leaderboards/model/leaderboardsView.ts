import {
  LEADERBOARD_MODES, LEADERBOARD_REGIONS,
  type LeaderboardMode, type LeaderboardRegion, type LeaderboardSeason, type LeaderboardSeasonCatalog, type LeaderboardStats,
  type LeaderboardTable,
} from './types';

export const LEADERBOARD_MODE_LABELS: Record<LeaderboardMode, string> = {
  standard: 'Стандартный',
  wild: 'Вольный',
  battlegrounds: 'Поля сражений',
  battlegroundsduo: 'Поля сражений: дуо',
  arena: 'Арена',
  undergroundarena: 'Подземная арена',
  twist: 'Твист',
};

/** Короткие подписи вкладок: на телефоне семь вкладок должны помещаться в прокручиваемую строку. */
export const LEADERBOARD_MODE_TABS: Record<LeaderboardMode, string> = {
  standard: 'Стандарт',
  wild: 'Вольный',
  battlegrounds: 'Поля сражений',
  battlegroundsduo: 'Дуо',
  arena: 'Арена',
  undergroundarena: 'Подземная арена',
  twist: 'Твист',
};

export const LEADERBOARD_REGION_LABELS: Record<LeaderboardRegion, string> = { EU: 'Европа', US: 'Америка', AP: 'Азия' };

/** Что Blizzard пишет в колонке рейтинга: MMR Полей сражений, среднее число побед Арены, очки Подземной арены. */
export const LEADERBOARD_RATING_LABELS: Partial<Record<LeaderboardMode, string>> = {
  battlegrounds: 'Рейтинг',
  battlegroundsduo: 'Рейтинг',
  arena: 'Ср. побед',
  undergroundarena: 'Очки',
};

export type LeaderboardSelection = {
  mode: LeaderboardMode;
  region: LeaderboardRegion;
  /** `null` — последний сохранённый сезон. */
  season: number | null;
  page: number;
  query: string;
  /** Открытая карточка игрока (ник без номера BattleTag). */
  player: string | null;
  /** Место, к которому перешли («к месту N», «к моему нику»): его строка подсвечена, страница — его. */
  rank: number | null;
};

/** Строк на странице сайта; совпадает с `LEADERBOARD_PAGE_SIZE` сервера. */
export const LEADERBOARD_PAGE_SIZE = 50;
/** Больше мест hs-data-api не хранит: 2000 страниц Blizzard по 25 строк. */
export const LEADERBOARD_MAX_RANK = 50_000;

export const DEFAULT_LEADERBOARD_SELECTION: LeaderboardSelection = {
  mode: 'standard', region: 'EU', season: null, page: 1, query: '', player: null, rank: null,
};

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function isLeaderboardMode(value: unknown): value is LeaderboardMode {
  return typeof value === 'string' && (LEADERBOARD_MODES as readonly string[]).includes(value);
}

export function isLeaderboardRegion(value: unknown): value is LeaderboardRegion {
  return typeof value === 'string' && (LEADERBOARD_REGIONS as readonly string[]).includes(value);
}

/** Выбор из строки запроса: неверные значения заменяются значениями по умолчанию, а не ломают страницу. */
export function parseLeaderboardSelection(search: URLSearchParams): LeaderboardSelection {
  const mode = search.get('mode');
  const region = search.get('region');
  const season = search.get('season');
  const page = search.get('page');
  const query = (search.get('q') ?? '').trim().slice(0, 32);
  const player = (search.get('player') ?? '').trim().slice(0, 64);
  const rank = search.get('rank');
  const target = rank && /^\d{1,5}$/.test(rank) && Number(rank) >= 1 && Number(rank) <= LEADERBOARD_MAX_RANK ? Number(rank) : null;
  return {
    mode: isLeaderboardMode(mode) ? mode : DEFAULT_LEADERBOARD_SELECTION.mode,
    region: isLeaderboardRegion(region) ? region : DEFAULT_LEADERBOARD_SELECTION.region,
    season: season && /^\d{1,6}$/.test(season) ? Number(season) : null,
    // Место задаёт страницу и сильнее `page`: ссылка «к месту» не может разойтись со своей строкой.
    page: target !== null && !query ? pageOfRank(target)
      : page && /^\d{1,4}$/.test(page) && Number(page) >= 1 ? Math.min(Number(page), 1000) : 1,
    query,
    player: player || null,
    rank: query ? null : target,
  };
}

export function pageOfRank(rank: number): number {
  return Math.ceil(rank / LEADERBOARD_PAGE_SIZE);
}

/** Строка запроса страницы: только отличия от значений по умолчанию, чтобы ссылка оставалась короткой. */
export function leaderboardSearch(selection: LeaderboardSelection): string {
  const params = new URLSearchParams();
  if (selection.mode !== 'standard') params.set('mode', selection.mode);
  if (selection.region !== 'EU') params.set('region', selection.region);
  if (selection.season !== null) params.set('season', String(selection.season));
  if (selection.rank !== null) params.set('rank', String(selection.rank));
  else if (selection.page > 1) params.set('page', String(selection.page));
  if (selection.query) params.set('q', selection.query);
  if (selection.player) params.set('player', selection.player);
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Параметры `/api/leaderboards/table` и `/stats` для выбора. */
export function leaderboardApiQuery(selection: LeaderboardSelection, withPage: boolean): string {
  const params = new URLSearchParams({ mode: selection.mode, region: selection.region });
  if (selection.season !== null) params.set('season', String(selection.season));
  if (withPage) {
    if (selection.page > 1) params.set('page', String(selection.page));
    if (selection.query) params.set('q', selection.query);
  }
  return params.toString();
}

export function leaderboardSeasons(catalog: LeaderboardSeasonCatalog | null, mode: LeaderboardMode, region: LeaderboardRegion): LeaderboardSeason[] {
  return catalog?.modes.find(entry => entry.mode === mode)?.regions[region] ?? [];
}

export function formatSeasonLabel(season: { id: number; start: string | null; latest?: boolean }): string {
  const month = season.start ? Number(season.start.slice(5, 7)) - 1 : -1;
  const when = month >= 0 && month < 12 ? ` · ${MONTHS[month]} ${season.start?.slice(0, 4)}` : '';
  return `Сезон ${season.id}${when}${season.latest ? ' — текущий' : ''}`;
}

export function formatLeaderboardDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return `${date} ${MONTHS_GENITIVE[(month ?? 1) - 1] ?? ''} ${year}`;
}

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Время снимка по Москве (UTC+3 без летнего времени), собранное вручную:
 * `Intl` с часами форматирует по-разному в Node и браузерах, и гидратация
 * разошлась бы с HTML сервера. По той же причине числа группируются вручную.
 */
export function formatLeaderboardTime(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  const moscow = new Date(time + MOSCOW_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${moscow.getUTCDate()} ${MONTHS_GENITIVE[moscow.getUTCMonth()]}, ${pad(moscow.getUTCHours())}:${pad(moscow.getUTCMinutes())} МСК`;
}

function groupDigits(value: number): string {
  return String(Math.abs(Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

export function formatPlayers(value: number): string {
  return `${value < 0 ? '−' : ''}${groupDigits(value)}`;
}

/** Рейтинг в формате колонки режима: средние победы Арены с двумя знаками, остальное целым. */
export function formatRating(mode: LeaderboardMode, value: number | null): string {
  if (value === null) return '—';
  if (mode === 'arena') {
    const [whole, fraction] = value.toFixed(2).split('.');
    return `${groupDigits(Number(whole))},${fraction}`;
  }
  return formatPlayers(Math.round(value));
}

/** Короткая подпись оси: 8000 → «8к», 8500 → «8,5к»; дробные победы Арены — с запятой. */
export function formatRatingTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${String(Math.round(value / 100) / 10).replace('.', ',')}к`;
  return String(Math.round(value * 100) / 100).replace('.', ',');
}

export type RankChange = { kind: 'up' | 'down' | 'same' | 'new'; label: string; text: string };

/** Изменение места за сутки: «↑3» — поднялся на три места. `null` — сравнивать не с чем (первый снимок). */
export function rankChange(rank: number, previousRank: number | null, hasPrevious: boolean): RankChange | null {
  if (!hasPrevious) return null;
  if (previousRank === null) return { kind: 'new', label: 'новый', text: 'Не было в таблице в прошлом снимке' };
  const delta = previousRank - rank;
  if (delta === 0) return { kind: 'same', label: '—', text: 'Место не изменилось' };
  return delta > 0
    ? { kind: 'up', label: `↑${formatPlayers(delta)}`, text: `Поднялся на ${delta}` }
    : { kind: 'down', label: `↓${formatPlayers(-delta)}`, text: `Опустился на ${-delta}` };
}

/** Изменение числа игроков между двумя последними снимками сезона. */
export function playersDelta(stats: LeaderboardStats): number | null {
  const { series } = stats;
  if (series.length < 2) return null;
  return series[series.length - 1].players - series[series.length - 2].players;
}

export function boardTitle(table: Pick<LeaderboardTable, 'board'>): string {
  return `${LEADERBOARD_MODE_LABELS[table.board.mode]} · ${LEADERBOARD_REGION_LABELS[table.board.region]} · ${formatSeasonLabel({ id: table.board.season, start: table.board.seasonStart })}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Ответы Express проверены сервером; клиенту достаточно узнать форму, чтобы не нарисовать чужой ответ. */
export function isLeaderboardTable(value: unknown): value is LeaderboardTable {
  return isObject(value) && isObject(value.board) && isObject(value.snapshot) && Array.isArray(value.rows) && typeof value.total === 'number';
}

export function isLeaderboardStats(value: unknown): value is LeaderboardStats {
  return isObject(value) && isObject(value.board) && Array.isArray(value.thresholds) && Array.isArray(value.series);
}

export function isLeaderboardSeasonCatalog(value: unknown): value is LeaderboardSeasonCatalog {
  return isObject(value) && Array.isArray(value.modes);
}
