import { createBattlegroundLibraryResource } from '../modules/battlegrounds/public';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import { cleanSearch, type LibraryCard, type LibraryMeta } from './bgLibraryCards';
import { dedupeLibraryCards } from './bgLibraryCardImages';
import { isBaseLibraryKind, sectionFor, type LibraryKind, type PoolMode } from './bgLibrarySections';

const BG_LIBRARY_API_VERSION = 'bg-library-20260923-pool-3661';

const MECHANIC_LABEL_OVERRIDES: Record<string, string> = {
  bacon_fresh_tooltip: 'В следующих обновлениях',
  bacon_refresh_tooltip: 'В следующих обновлениях',
  bacon_blood_gem_tooltip: 'Кровавые самоцветы',
  immune: 'Неуязвимость',
};

const HIDDEN_MECHANIC_KEYS = new Set([
  'bacon_pass_tooltip',
  'secret',
]);


export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithDeadline(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload as T;
}

export function versionedLibraryUrl(path: string, params: Record<string, string | number | boolean | null | undefined> = {}): string {
  const search = new URLSearchParams({ v: BG_LIBRARY_API_VERSION });
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) search.set(key, String(value));
  }
  return `${path}?${search.toString()}`;
}


function mechanicKey(value: unknown): string {
  return cleanSearch(value)
    .replace(/[^a-zа-я0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function fetchJsonOrNull<T>(url: string): Promise<T | null> {
  try {
    return await fetchJson<T>(url);
  } catch {
    return null;
  }
}

function normalizeMechanic(value: any): { slug: string; name_ru: string } | null {
  const label = typeof value === 'string'
    ? value
    : (value?.name_ru || value?.name_en || value?.slug || value?.name || '');
  if (!label) return null;
  const slug = String(typeof value === 'string' ? cleanSearch(label) : (value?.slug || cleanSearch(label)));
  const key = mechanicKey(slug || label);
  if (HIDDEN_MECHANIC_KEYS.has(key)) return null;
  return { slug, name_ru: MECHANIC_LABEL_OVERRIDES[key] || String(label) };
}

export function normalizeMechanics(values: unknown): Array<{ slug: string; name_ru: string }> {
  if (!Array.isArray(values)) return [];
  const mechanics: Array<{ slug: string; name_ru: string }> = [];
  for (const value of values) {
    const mechanic = normalizeMechanic(value);
    if (mechanic) mechanics.push(mechanic);
  }
  return mechanics;
}

function normalizeAuxiliaryLibraryCard(item: any, kind: LibraryKind): LibraryCard {
  const library = item?.library || item?.category || { slug: kind, name_ru: sectionFor(kind).shortTitle };
  const group = item?.group || null;
  const textRu = item?.text_ru || item?.text?.ru || '';
  const minionType = item?.minion_type || item?.race || item?.creature_type?.name_ru || null;
  const rawTavernTier = item?.tavern_tier ?? item?.tavernTier ?? null;
  const tavernTier = rawTavernTier !== null && rawTavernTier !== undefined && rawTavernTier !== ''
    ? Number(rawTavernTier)
    : null;
  return {
    ...item,
    id: item?.id ?? item?.dbf ?? item?.card_id,
    dbf: Number(item?.dbf ?? item?.dbfId ?? 0),
    library,
    category: item?.category,
    card_type: item?.card_type || { slug: kind, name_ru: sectionFor(kind).shortTitle },
    name: {
      ru: item?.name?.ru || item?.localized_name || item?.name || item?.card_id,
      en: item?.name?.en || item?.name || item?.card_id,
    },
    tavern_tier: Number.isFinite(tavernTier) ? tavernTier : null,
    tier: item?.tier ?? item?.meta_tier ?? item?.rating_tier ?? null,
    creature_type: item?.creature_type || (minionType ? { slug: cleanSearch(String(minionType)), name_ru: String(minionType) } : null),
    minion_type: minionType,
    attack: item?.attack ?? null,
    health: item?.health ?? null,
    in_pool: Boolean(item?.in_pool ?? item?.pool_status === 'available'),
    duos_only: Boolean(item?.duos_only),
    mechanics: normalizeMechanics(item?.mechanics || item?.wiki?.wiki_mechanics_localized || []),
    text: item?.text,
    text_ru: textRu,
    images: {
      card: item?.images?.card || item?.image_url || item?.image || null,
      golden: item?.images?.golden || item?.golden?.image || null,
      art: item?.images?.art || item?.images?.crop || null,
      crop: item?.images?.crop || null,
      framed: item?.images?.framed || null,
    },
    group,
    source: item?.source || item?.wiki?.source || null,
    wiki_page: item?.wiki_page || item?.wiki?.page || null,
    mana_cost: item?.mana_cost ?? item?.cost ?? null,
    artist: item?.artist || null,
    golden: item?.golden,
  };
}

export async function fetchAuxiliaryLibraryCards(kind: LibraryKind, pool: PoolMode, params: Record<string, string | number> = {}): Promise<LibraryCard[]> {
  const section = sectionFor(kind);
  if (!section.endpoint) return [];
  const baseParams = new URLSearchParams({
    v: BG_LIBRARY_API_VERSION,
    per_page: '200',
    page: '1',
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
  });
  if (section.supportsArchive) baseParams.set('in_pool', pool === 'current' ? '1' : '0');

  const fetchPage = async (page: number) => {
    const pageParams = new URLSearchParams(baseParams);
    pageParams.set('page', String(page));
    return fetchJson<{ data?: any[]; pagination?: { total?: number; page?: number; per_page?: number; pages?: number } }>(
      `/api/bg/library/extra/${section.endpoint}?${pageParams.toString()}`
    );
  };

  const first = await fetchPage(1);
  const data = Array.isArray(first.data) ? first.data : [];
  const total = Number(first.pagination?.total || data.length);
  const perPage = Number(first.pagination?.per_page || data.length || 200);
  const pages = Math.max(1, Number(first.pagination?.pages || Math.ceil(total / Math.max(1, perPage))));
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) => fetchPage(index + 2).catch(() => ({ data: [] })))
    );
    rest.forEach(page => data.push(...(Array.isArray(page.data) ? page.data : [])));
  }
  return data.map(item => normalizeAuxiliaryLibraryCard(item, kind)).filter(card => card.dbf || card.card_id);
}


/**
 * The protected catalog of the library (`/api/bg/library/*`, behind the subscription): the subscriber's views read it
 * with `useBattlegroundLibraryData`, and so does a listing page that already shows the listing view on the open cards,
 * which then only swaps its cards. A module of its own, loaded on demand like the paid views.
 */
export const bgLibraryCatalogResource = createBattlegroundLibraryResource(async (kindValue, poolValue) => {
  const kind = kindValue as LibraryKind;
  const pool = poolValue as PoolMode;
  const inPool = pool === 'current' ? '1' : '0';
  const [rawMeta, rawCards] = await Promise.all([
    isBaseLibraryKind(kind) ? fetchJson<LibraryMeta>(versionedLibraryUrl('/api/bg/library/meta')).catch(() => ({} as LibraryMeta)) : Promise.resolve({} as LibraryMeta),
    isBaseLibraryKind(kind)
      ? fetchJson<{ data: LibraryCard[] }>(versionedLibraryUrl('/api/bg/library/cards', { card_type: kind, in_pool: inPool })).then(result => result.data || [])
      : fetchAuxiliaryLibraryCards(kind, pool),
  ]);
  const cards = rawCards.filter(card => card?.dbf || card?.card_id)
    .map(card => ({ ...card, mechanics: normalizeMechanics(card.mechanics) }));
  return { meta: { ...rawMeta, mechanics: normalizeMechanics(rawMeta.mechanics) }, cards: dedupeLibraryCards(cards) };
});
