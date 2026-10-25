/** Страница «Стримеры» поверх hs-data-api `/v1/hsguru/streamers*` (docs/specs/streamers.md). */

export type StreamerFormat = 'standard' | 'wild' | 'classic' | 'twist';

export type StreamerDeck = {
  deckId: number;
  code: string;
  /** Имя архетипа HSGuru. */
  archetype: string;
  /** Русское имя архетипа сайта. */
  archetypeLabel: string;
  /** `priest`, `deathknight`, … или `null`. */
  classKey: string | null;
  format: StreamerFormat;
  /** Ранги Легенды; `null` вне Легенды. */
  peakRank: number | null;
  latestRank: number | null;
  wins: number | null;
  losses: number | null;
  lastPlayedAt: string;
  /** Запись трансляции с моментом игры. */
  vodUrl: string | null;
  /** Колода сыграна в текущем эфире. */
  onStream: boolean;
};

export type StreamerLink = { kind: 'twitch' | 'youtube' | 'x' | 'discord' | 'telegram' | 'vk' | 'boosty' | 'instagram' | 'tiktok'; url: string };

export type StreamerLive = {
  title: string | null;
  viewers: number | null;
  /** Режим HSGuru или формат колоды эфира: `standard`, `battlegrounds`, … */
  mode: string | null;
  startedAt: string | null;
  streamUrl: string;
  thumbnailUrl: string | null;
};

/** Место ника в официальной таблице лидеров Blizzard (совпадение по имени). */
export type StreamerLadder = {
  rank: number;
  region: 'EU' | 'US' | 'AP';
  mode: 'standard' | 'wild';
  /** Таблица текущего сезона; иначе — последний сохранённый сезон. */
  current: boolean;
  /** Начало сезона `YYYY-MM-DD`, если известно. */
  seasonStart: string | null;
};

export type StreamerSummary = {
  slug: string;
  name: string;
  avatarUrl: string | null;
  followers: number | null;
  /** Язык канала, если HSGuru его знает (сейчас только `ru`). */
  language: string | null;
  links: StreamerLink[];
  live: StreamerLive | null;
  decksTotal: number;
  lastPlayedAt: string | null;
  /** Лучший ранг Легенды за 30 дней в фильтрах каталога; `null` вне Легенды. */
  bestRank: number | null;
  ladder: StreamerLadder | null;
  recentDecks: StreamerDeck[];
};

export type LiveStream = {
  login: string;
  name: string;
  /** Страница стримера на сайте, если у HSGuru есть его колоды. */
  slug: string | null;
  avatarUrl: string | null;
  language: string | null;
  live: StreamerLive;
  deck: StreamerDeck | null;
};

export type StreamerFilters = { format: StreamerFormat | null; classKey: string | null };

/** `active` — сначала в эфире, затем по последней колоде; `rank` — по лучшему рангу Легенды. */
export type StreamerSort = 'active' | 'rank';

export type StreamersFilters = StreamerFilters & {
  language: 'ru' | null;
  live: boolean;
  /** Поиск по нику. */
  query: string | null;
  sort: StreamerSort;
};

export type StreamersPage = {
  live: LiveStream[];
  streamers: StreamerSummary[];
  total: number;
  offset: number;
  filters: StreamersFilters;
};

export type StreamerFacet = { format: StreamerFormat; classKey: string | null; decks: number };

export type StreamerProfile = StreamerSummary & { description: string | null; facets: StreamerFacet[] };

export type StreamerWeekArchetype = {
  archetype: string;
  archetypeLabel: string;
  classKey: string | null;
  format: StreamerFormat;
  decks: number;
  wins: number;
  losses: number;
};

/** Колоды, сыгранные за 7 дней, по архетипам; счёт — все игры этих колод на HSGuru. */
export type StreamerWeek = {
  decks: number;
  wins: number;
  losses: number;
  archetypes: StreamerWeekArchetype[];
};

export type StreamerPage = {
  streamer: StreamerProfile;
  /** Только в первой порции (`offset=0`); `null`, если неделю прочитать не удалось. */
  week: StreamerWeek | null;
  decks: StreamerDeck[];
  total: number;
  offset: number;
  filters: StreamerFilters;
};
