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

export type StreamerSummary = {
  slug: string;
  name: string;
  avatarUrl: string | null;
  followers: number | null;
  links: StreamerLink[];
  live: StreamerLive | null;
  decksTotal: number;
  lastPlayedAt: string | null;
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

export type StreamersPage = {
  live: LiveStream[];
  streamers: StreamerSummary[];
  total: number;
  offset: number;
  filters: StreamerFilters;
};

export type StreamerFacet = { format: StreamerFormat; classKey: string | null; decks: number };

export type StreamerProfile = StreamerSummary & { description: string | null; facets: StreamerFacet[] };

export type StreamerPage = {
  streamer: StreamerProfile;
  decks: StreamerDeck[];
  total: number;
  offset: number;
  filters: StreamerFilters;
};
