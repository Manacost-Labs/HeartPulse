import type {
  LiveStream, StreamerDeck, StreamerFacet, StreamerFormat, StreamerLink, StreamerLive, StreamerProfile, StreamerSummary,
} from './types.js';

type JsonRecord = Record<string, unknown>;

/** Русское имя архетипа по имени HSGuru; без переводов остаётся английское. */
export type ArchetypeNamer = (name: string) => string;

const FORMATS: readonly StreamerFormat[] = ['standard', 'wild', 'classic', 'twist'];
const CLASS_KEYS = new Set(['deathknight', 'demonhunter', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior']);
const MODES = new Set([...FORMATS, 'battlegrounds', 'arena', 'mercenaries', 'duels', 'tavern_brawl', 'fireside_gathering']);
const LINK_HOSTS: Record<StreamerLink['kind'], readonly string[]> = {
  twitch: ['twitch.tv'], youtube: ['youtube.com', 'youtu.be'], x: ['x.com', 'twitter.com'], discord: ['discord.gg', 'discord.com'],
  telegram: ['t.me', 'telegram.me'], vk: ['vk.com'], boosty: ['boosty.to'], instagram: ['instagram.com'], tiktok: ['tiktok.com'],
};
const IMAGE_HOSTS = ['static-cdn.jtvnw.net'];
const SLUG = /^[a-z0-9_]{1,40}$/;

export function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown, max = 300): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isoDate(value: unknown): string | null {
  const raw = text(value, 40);
  return raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
}

/** Только https и только хосты из списка: ссылки пришли со сторонних страниц. */
export function safeUrl(value: unknown, hosts: readonly string[]): string | null {
  const raw = text(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return hosts.some(item => host === item || host.endsWith(`.${item}`)) ? url.href : null;
  } catch {
    return null;
  }
}

function language(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z]{2}$/.test(value) ? value : null;
}

export function streamerFormat(value: unknown): StreamerFormat | null {
  return FORMATS.find(format => format === value) ?? null;
}

export function streamerClassKey(value: unknown): string | null {
  const key = typeof value === 'string' ? value.toLowerCase() : '';
  return CLASS_KEYS.has(key) ? key : null;
}

export function streamerSlug(value: unknown): string | null {
  return typeof value === 'string' && SLUG.test(value) ? value : null;
}

export function parseDeck(value: unknown, nameArchetype: ArchetypeNamer): StreamerDeck | null {
  const deck = record(value);
  const deckId = count(deck.deck_id);
  const code = text(deck.deck_code, 400);
  const archetype = text(deck.archetype, 120);
  const format = streamerFormat(deck.format);
  const lastPlayedAt = isoDate(deck.last_played_at);
  if (!deckId || !code || !/^[A-Za-z0-9+/=]+$/.test(code) || !archetype || !format || !lastPlayedAt) return null;
  return {
    deckId, code, archetype, archetypeLabel: nameArchetype(archetype) || archetype,
    classKey: streamerClassKey(deck.player_class), format,
    peakRank: count(deck.peak_rank) || null, latestRank: count(deck.latest_rank) || null,
    wins: count(deck.wins), losses: count(deck.losses), lastPlayedAt,
    vodUrl: safeUrl(record(deck.vod).url, LINK_HOSTS.twitch),
    onStream: deck.on_current_stream === true,
  };
}

export function parseLive(value: unknown): StreamerLive | null {
  const live = record(value);
  const streamUrl = safeUrl(live.stream_url, LINK_HOSTS.twitch);
  if (!streamUrl) return null;
  const mode = typeof live.mode === 'string' && MODES.has(live.mode) ? live.mode : null;
  return {
    title: text(live.title, 200), viewers: count(live.viewers), mode,
    startedAt: isoDate(live.started_at), streamUrl, thumbnailUrl: safeUrl(live.thumbnail_url, IMAGE_HOSTS),
  };
}

function links(streamer: JsonRecord): StreamerLink[] {
  const found: StreamerLink[] = [];
  const add = (kind: StreamerLink['kind'], value: unknown) => {
    const url = safeUrl(value, LINK_HOSTS[kind]);
    if (url && !found.some(link => link.kind === kind)) found.push({ kind, url });
  };
  add('twitch', streamer.twitch_url);
  add('youtube', streamer.youtube_url);
  add('x', streamer.x_url);
  for (const item of Array.isArray(streamer.links) ? streamer.links : []) {
    const link = record(item);
    if (typeof link.kind === 'string' && link.kind in LINK_HOSTS) add(link.kind as StreamerLink['kind'], link.url);
  }
  return found;
}

export function parseSummary(value: unknown, nameArchetype: ArchetypeNamer): StreamerSummary | null {
  const streamer = record(value);
  const slug = streamerSlug(streamer.slug);
  const name = text(streamer.display_name, 60);
  if (!slug || !name) return null;
  return {
    slug, name, avatarUrl: safeUrl(streamer.avatar_url, IMAGE_HOSTS), followers: count(streamer.followers),
    language: language(streamer.language),
    links: links(streamer), live: parseLive(streamer.live), decksTotal: count(streamer.decks_total) ?? 0,
    lastPlayedAt: isoDate(streamer.last_played_at), bestRank: count(record(streamer.window).best_rank) || null, ladder: null,
    recentDecks: (Array.isArray(streamer.recent_decks) ? streamer.recent_decks : [])
      .map(deck => parseDeck(deck, nameArchetype)).filter((deck): deck is StreamerDeck => deck !== null),
  };
}

export function parseProfile(value: unknown, nameArchetype: ArchetypeNamer): StreamerProfile | null {
  const streamer = record(value);
  const summary = parseSummary(streamer, nameArchetype);
  if (!summary) return null;
  const facets: StreamerFacet[] = [];
  for (const item of Array.isArray(streamer.facets) ? streamer.facets : []) {
    const facet = record(item);
    const format = streamerFormat(facet.format);
    const decks = count(facet.decks);
    if (format && decks) facets.push({ format, classKey: streamerClassKey(facet.player_class), decks });
  }
  const last = parseDeck(streamer.last_deck, nameArchetype);
  return { ...summary, recentDecks: last ? [last] : [], description: text(streamer.description, 500), facets };
}

export function parseLiveStream(value: unknown, nameArchetype: ArchetypeNamer): LiveStream | null {
  const stream = record(value);
  const live = parseLive(stream);
  const login = streamerSlug(stream.login);
  const name = text(stream.display_name, 60);
  if (!live || !login || !name) return null;
  const known = record(stream.streamer);
  return {
    login, name, slug: streamerSlug(known.slug), avatarUrl: safeUrl(known.avatar_url, IMAGE_HOSTS),
    language: language(stream.language),
    live, deck: parseDeck(stream.current_deck, nameArchetype),
  };
}

/** Строки ответа hs-data-api `{ data: [...] }`, отбрасывая непрошедшие проверку. */
export function parseRows<T>(payload: unknown, parse: (row: unknown) => T | null): T[] {
  const rows = record(payload).data;
  if (!Array.isArray(rows)) throw new Error('streamers: response without data');
  return rows.map(parse).filter((row): row is T => row !== null);
}

export function metaCount(payload: unknown): number {
  return count(record(record(payload).meta).count) ?? 0;
}
