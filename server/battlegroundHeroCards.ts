/**
 * The BG app's hero details carry `cards` only for the best composition's
 * lineup, so most «Ключевые существа финала» had no Russian name and no base
 * card id. This fills the gaps from the BG app's card library before the
 * proxy caches the payload.
 */

/** The fields of `GET /api/bg/library/cards/by-dbf/:dbf` the hero page reads. */
export type BattlegroundLibraryCard = {
  card_id?: string | null;
  dbf?: number | null;
  variant?: { kind?: string | null; base_card_id?: string | null } | null;
  name?: { ru?: string | null; en?: string | null } | null;
  text_ru?: string | null;
  tavern_tier?: number | null;
  creature_type?: { slug?: string | null; name_ru?: string | null } | null;
};

export type BattlegroundLibraryCardLookup = (dbf: string) => Promise<BattlegroundLibraryCard | null>;

type MinionRow = { dbfId?: unknown; minion_dbf_id?: unknown };
/** The part of the hero details payload this module reads; everything else passes through. */
type HeroDetailsPayload = {
  stats?: { best_composition?: { lineup?: unknown; final_form_minions?: unknown } | null } | null;
  cards?: Record<string, Record<string, unknown>> | null;
};

const MAX_LOOKUPS = 60;

function minionDbfIds(payload: HeroDetailsPayload): string[] {
  const best = payload?.stats?.best_composition;
  const rows: MinionRow[] = [
    ...(Array.isArray(best?.lineup) ? best.lineup : []),
    ...(Array.isArray(best?.final_form_minions) ? best.final_form_minions : []),
  ];
  const ids = rows.map(row => String(row?.dbfId ?? row?.minion_dbf_id ?? '')).filter(id => /^\d{1,9}$/.test(id));
  return [...new Set(ids)].slice(0, MAX_LOOKUPS);
}

const present = (value: unknown) => value !== null && value !== undefined && value !== '';

/** Card fields from the library; fields the details payload already has win. */
function mergedCard(existing: Record<string, unknown> | undefined, library: BattlegroundLibraryCard, dbf: string) {
  const fromLibrary: Record<string, unknown> = {
    dbf: Number(dbf),
    card_id: library.card_id,
    name: library.name?.ru || library.name?.en,
    text: library.text_ru,
    tavern_tier: library.tavern_tier,
    creature_type: library.creature_type?.slug,
    creature_type_name: library.creature_type?.name_ru,
  };
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(fromLibrary)) {
    if (!present(merged[key]) && present(value)) merged[key] = value;
  }
  // Golden ids such as `TB_BaconUps_045` cannot be mapped to their base card by pattern.
  const baseCardId = library.variant?.kind === 'golden' ? library.variant.base_card_id : library.card_id;
  if (baseCardId) merged.base_card_id = baseCardId;
  return merged;
}

/** Adds library cards for every lineup and final-board minion; a failed lookup leaves the card as it was. */
export async function enrichBattlegroundHeroCards<T extends HeroDetailsPayload>(payload: T, lookup: BattlegroundLibraryCardLookup): Promise<T> {
  const ids = minionDbfIds(payload);
  if (!ids.length) return payload;
  const library = await Promise.all(ids.map(id => lookup(id).catch(() => null)));
  const cards: Record<string, Record<string, unknown>> = { ...(payload?.cards && typeof payload.cards === 'object' ? payload.cards : {}) };
  ids.forEach((id, index) => {
    const card = library[index];
    if (card) cards[id] = mergedCard(cards[id], card, id);
  });
  return { ...payload, cards };
}

/**
 * Reads library cards from the BG app with a bounded in-memory cache. Misses
 * are cached too, briefly, so an unknown dbf does not hit the app on every
 * hero request.
 */
export function createBattlegroundLibraryCardLookup({
  baseUrl,
  fetchImpl = fetch,
  ttlMs = 6 * 60 * 60_000,
  missTtlMs = 10 * 60_000,
  timeoutMs = 4_000,
  maxEntries = 3_000,
}: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  ttlMs?: number;
  missTtlMs?: number;
  timeoutMs?: number;
  maxEntries?: number;
}): BattlegroundLibraryCardLookup {
  const cache = new Map<string, { expiresAt: number; card: Promise<BattlegroundLibraryCard | null> }>();
  return dbf => {
    const now = Date.now();
    const cached = cache.get(dbf);
    if (cached && cached.expiresAt > now) return cached.card;
    const card = fetchImpl(new URL(`/api/bg/library/cards/by-dbf/${encodeURIComponent(dbf)}`, baseUrl), { signal: AbortSignal.timeout(timeoutMs) })
      .then(response => (response.ok ? response.json() as Promise<BattlegroundLibraryCard> : null))
      .catch(() => null);
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value as string);
    cache.set(dbf, { expiresAt: now + ttlMs, card });
    void card.then(result => {
      if (!result) cache.set(dbf, { expiresAt: Date.now() + missTtlMs, card });
    });
    return card;
  };
}
