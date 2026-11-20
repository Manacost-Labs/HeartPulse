import type { PublicBattlegroundHeroCard, PublicBattlegroundHeroProfile } from './battlegroundHeroPublicTypes.js';
import { DEFAULT_HS_DATA_API_ORIGIN } from './hsDataApiOrigin.js';

type JsonRecord = Record<string, unknown>;

/** Hosts a hero's outbound links may point to: the wiki and the card databases the library names. */
/**
 * The hero library (`/heroes?dbf=`): the kolodahearthstone API root the subscriber's library proxy reads
 * (`KOLODAHS_API_BASE_URL`); `HS_DATA_API_BASE_URL` may be a loopback upstream without the hero library.
 */
export const heroLibraryUrl = (dbfId: string | number) =>
  `${(process.env.KOLODAHS_API_BASE_URL || `${DEFAULT_HS_DATA_API_ORIGIN}/api/v1`).replace(/\/+$/, '')}/heroes?dbf=${dbfId}`;

const LINK_HOSTS = new Set(['hearthstone.wiki.gg', 'hsreplay.net', 'www.hearthpwn.com', 'hearthpwn.com']);
const PROFILE_TTL_MS = 10 * 60_000;
const FAILURE_PAUSE_MS = 60_000;
const PROFILE_TIMEOUT_MS = 3_000;
const PROFILE_CACHE_SIZE = 256;
const MAX_READS_IN_FLIGHT = 16;

const record = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

function plain(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/<[^>]*>/g, ' ').replace(/\[[^\]]+]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

function link(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && LINK_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

/** A companion card by name: its text as plain text, its pictures through the same-origin resource proxy. */
function card(value: unknown, imageUrl: (value: unknown) => string | null): PublicBattlegroundHeroCard | null {
  const source = record(value);
  const name = plain(source.name, 180);
  const image = imageUrl(source.image);
  if (!name || !image) return null;
  return { name, text: plain(source.text, 500), image, imageGold: imageUrl(source.image_gold) };
}

/** The balance history of a hero, copied field by field from `wiki.card_changes`: texts plain, links to the allowed hosts only. */
function patchHistory(value: unknown): PublicBattlegroundHeroProfile['patches'] {
  return (Array.isArray(value) ? value : []).slice(0, 8).map(record).map(group => ({
    heading: plain(group.heading, 120),
    entries: (Array.isArray(group.entries) ? group.entries : []).slice(0, 80).map(record).map(entry => ({
      date: plain(entry.date, 20),
      patch: plain(entry.patch, 80),
      patch_url: link(entry.patch_url),
      wiki_url: link(entry.wiki_url),
      items: (Array.isArray(entry.items) ? entry.items : []).slice(0, 30)
        .flatMap(item => { const line = plain(item, 500); return line ? [line] : []; }),
    })).filter(entry => entry.items.length > 0 || entry.patch),
  })).filter(group => group.entries.length > 0);
}

/**
 * The open profile of a hero from the hero library (`/api/v1/heroes?dbf=`): game content only, copied field by field
 * (the artist, race, health and armor, the description, the full art, the companion and its golden version, skins,
 * outbound links, the patch history). Statistics and every other field stay out. Pictures are
 * same-origin resource URLs (`imageUrl` answers `null` for a host the proxy does not serve: the picture is dropped).
 */
export function projectBattlegroundHeroProfile(
  payload: unknown,
  dbfId: number,
  imageUrl: (value: unknown) => string | null,
): PublicBattlegroundHeroProfile | null {
  const rows = Array.isArray(record(payload).data) ? record(payload).data as unknown[] : [];
  const hero = rows.map(record).find(row => Number(row.dbf) === dbfId);
  if (!hero) return null;
  const armor = record(hero.armor);
  const buddy = record(record(hero.buddy).card);
  const buddyCard = card(buddy, imageUrl);
  const wiki = record(hero.wiki);
  const skins = (Array.isArray(wiki.hero_skins) ? wiki.hero_skins : [])
    .flatMap(group => Array.isArray(record(group).cards) ? record(group).cards as unknown[] : [])
    .flatMap(value => {
      const skin = record(value);
      const image = imageUrl(skin.image_url);
      const title = plain(skin.title, 180);
      return image && title ? [{ cardId: plain(skin.card_id, 100), title, image, url: link(skin.url) }] : [];
    });
  const links = [
    ...(link(record(wiki.page).url) ? [{ label: 'Hearthstone Wiki', url: link(record(wiki.page).url) as string }] : []),
    ...(Array.isArray(wiki.external_links) ? wiki.external_links : []).flatMap(value => {
      const label = plain(record(value).label, 60);
      const url = link(record(value).url);
      return label && url ? [{ label, url }] : [];
    }),
  ];
  return {
    artist: plain(hero.artist, 180),
    race: plain(hero.race, 60),
    health: count(hero.health),
    armor: count(armor.normal) === null && count(armor.duos) === null ? null
      : { normal: count(armor.normal), duos: count(armor.duos) },
    description: plain(record(hero.character).description, 1_000),
    fullArt: imageUrl(record(hero.images).full_art),
    buddy: buddyCard ? { ...buddyCard, golden: card(buddy.golden, imageUrl) } : null,
    skins: skins.slice(0, 24),
    links: links.slice(0, 8),
    patches: patchHistory(wiki.card_changes),
  };
}

/**
 * Reads the open profile of a hero. The route asks only for a hero of the catalog (an unknown id is a 404 before
 * this), at most 256 heroes are kept (least recently read out first), one read per hero is in flight (concurrent
 * requests share it) and at most 16 overall, so ids and bursts cannot grow memory or fan out reads. A profile is
 * fresh for ten minutes. A failing library (3 s deadline, an answer without a `data` list, or a list without the
 * hero) answers the last good profile of the hero, or `null` without one, and is not asked again for this hero for a
 * minute: game content rarely changes, and a page neither waits for a library that is down nor loses its blocks.
 */
export function createHeroProfileLoader(options: {
  libraryUrl: (dbfId: number) => string;
  /** The public origin of the library's own picture paths (the kolodahearthstone API by default). */
  assetOrigin?: string;
  imageUrl: (value: unknown) => string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  onError?: (error: unknown) => void;
  now?: () => number;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  type Entry = { readAt: number; profile: PublicBattlegroundHeroProfile | null; failedAt?: number };
  const cache = new Map<number, Entry>();
  const inFlight = new Map<number, Promise<PublicBattlegroundHeroProfile | null>>();
  const keep = (dbfId: number, entry: Entry) => {
    cache.delete(dbfId);
    cache.set(dbfId, entry);
    if (cache.size > PROFILE_CACHE_SIZE) cache.delete(cache.keys().next().value as number);
  };
  // `previous` is the entry when the read started: it stays the fallback even if the LRU drops the hero meanwhile.
  const read = async (dbfId: number, previous: Entry | undefined): Promise<PublicBattlegroundHeroProfile | null> => {
    try {
      const response = await fetchImpl(options.libraryUrl(dbfId), {
        signal: AbortSignal.timeout(options.timeoutMs ?? PROFILE_TIMEOUT_MS),
        headers: { Accept: 'application/json', 'User-Agent': 'HearthPulse/BattlegroundHeroProfile' },
      });
      if (!response.ok) throw new Error(`Battleground hero library HTTP ${response.status}`);
      const payload: unknown = await response.json();
      if (!Array.isArray(record(payload).data)) throw new Error('Battleground hero library answered without data');
      // The library names some pictures by a path of its own (`/uploads/golden/…`): resolved against its public origin
      // (the resource proxy serves that host; a loopback library origin would not be).
      const libraryOrigin = options.assetOrigin ?? DEFAULT_HS_DATA_API_ORIGIN;
      const profile = projectBattlegroundHeroProfile(payload, dbfId, value => options.imageUrl(
        typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? `${libraryOrigin}${value}` : value));
      if (!profile) throw new Error(`Battleground hero library has no hero ${dbfId}`);
      keep(dbfId, { readAt: now(), profile });
      return profile;
    } catch (error) {
      try { options.onError?.(error); } catch { /* diagnostics are best-effort */ }
      const kept = cache.get(dbfId) ?? previous;
      keep(dbfId, { readAt: kept?.readAt ?? -Infinity, profile: kept?.profile ?? null, failedAt: now() });
      return kept?.profile ?? null;
    } finally {
      inFlight.delete(dbfId);
    }
  };
  return (dbfId: number): Promise<PublicBattlegroundHeroProfile | null> => {
    const kept = cache.get(dbfId);
    if (kept && (now() - kept.readAt < PROFILE_TTL_MS || (kept.failedAt !== undefined && now() - kept.failedAt < FAILURE_PAUSE_MS))) {
      keep(dbfId, kept);
      return Promise.resolve(kept.profile);
    }
    const pending = inFlight.get(dbfId);
    if (pending) return pending;
    if (inFlight.size >= MAX_READS_IN_FLIGHT) return Promise.resolve(kept?.profile ?? null);
    // Started on the next tick, so the read is registered before it can settle.
    const started = Promise.resolve().then(() => read(dbfId, kept));
    inFlight.set(dbfId, started);
    return started;
  };
}
