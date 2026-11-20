import type { PublicBattlegroundHeroCard, PublicBattlegroundHeroProfile } from './battlegroundHeroPublicTypes.js';

type JsonRecord = Record<string, unknown>;

/** Hosts a hero's outbound links may point to: the wiki and the card databases the library names. */
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

/**
 * The open profile of a hero from the hero library (`/api/v1/heroes?dbf=`): game content only, copied field by field
 * (the artist, race, health and armor, the description, the full art, the companion and its golden version, skins,
 * outbound links). The patch history (`wiki.card_changes`), statistics and every other field stay out. Pictures are
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
      const profile = projectBattlegroundHeroProfile(payload, dbfId, options.imageUrl);
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
