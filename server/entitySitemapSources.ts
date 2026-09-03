import type { BattlegroundLibraryKind } from './battlegroundLibrarySeoRoutes.js';

type JsonRecord = Record<string, unknown>;

type SourceOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const BATTLEGROUNDS_ORIGIN = 'http://127.0.0.1:3108';

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

async function fetchJson(url: string, options: SourceOptions): Promise<JsonRecord> {
  const timeoutMs = Math.max(1, Math.min(25_000, Math.floor(options.timeoutMs ?? 20_000)));
  const response = await (options.fetchImpl ?? fetch)(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'HearthPulse/EntitySitemap',
    },
  });
  if (!response.ok) throw new Error(`Entity sitemap catalog HTTP ${response.status}`);
  return record(await response.json());
}

export async function loadBattlegroundLibrarySitemapRows(
  kind: BattlegroundLibraryKind,
  options: SourceOptions = {},
): Promise<unknown[]> {
  const catalogs = await Promise.all([true, false].map(async inPool => {
    const url = new URL('/api/bg/library/cards', BATTLEGROUNDS_ORIGIN);
    url.searchParams.set('card_type', kind);
    url.searchParams.set('in_pool', String(Number(inPool)));
    const payload = await fetchJson(url.href, options);
    if (!Array.isArray(payload.data) || payload.data.length === 0) {
      throw new Error(`Entity sitemap ${kind} catalog is invalid or empty`);
    }
    return payload.data;
  }));
  return catalogs.flat();
}

function heroRows(payload: JsonRecord): unknown[] {
  if (payload.ok === false) throw new Error('Entity sitemap hero catalog reported an error');
  const heroes = Array.isArray(payload.heroes) ? payload.heroes : record(payload.view).heroes;
  if (!Array.isArray(heroes) || heroes.length === 0) {
    throw new Error('Entity sitemap hero catalog is invalid or empty');
  }
  return heroes;
}

export async function loadBattlegroundHeroSitemapRows(
  options: SourceOptions = {},
): Promise<unknown[]> {
  const [solo, duos] = await Promise.all([
    fetchJson(`${BATTLEGROUNDS_ORIGIN}/api/bg/heroes`, options).then(heroRows),
    fetchJson(`${BATTLEGROUNDS_ORIGIN}/api/bg/heroes?mode=duos`, options).then(heroRows),
  ]);
  const seen = new Set<string>();
  return [...solo, ...duos].filter(row => {
    const key = String(record(row).dbfId ?? '');
    if (!/^[1-9][0-9]*$/.test(key)) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function excludeStandardCardsFromWildCatalog(
  standardCards: unknown[],
  wildCards: unknown[],
): unknown[] {
  const standardIds = new Set(standardCards.map(card => record(card).card_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0));
  return wildCards.filter(card => {
    const cardId = record(card).card_id;
    return typeof cardId !== 'string' || !standardIds.has(cardId);
  });
}
