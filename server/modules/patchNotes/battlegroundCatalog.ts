import type { PatchCardResolver } from './parser.js';

/** One Battlegrounds card of the kolodahs catalog, reduced to what a patch entry needs. */
export type BattlegroundCatalogCard = {
  id: string;
  ru: string;
  en: string;
  /** `minion`, `spell`, `trinket`, `hero`, `dark-gift`, `anomaly`, `quest`, `reward`, `darkmoon-prize`. */
  cardType: string;
  /** `lesser` or `greater` for trinkets. */
  group: string | null;
  timewarped: boolean;
  renderUrl: string | null;
};

type Row = Record<string, unknown>;

/** Catalog lists in the order a name shared by two of them is resolved. */
const LIBRARIES: { path: string; cardType: string | null; timewarped?: boolean }[] = [
  { path: '/cards', cardType: null },
  { path: '/trinkets', cardType: 'trinket' },
  { path: '/heroes', cardType: 'hero' },
  { path: '/dark-gifts', cardType: 'dark-gift' },
  { path: '/anomalies', cardType: 'anomaly' },
  { path: '/quests', cardType: 'quest' },
  { path: '/rewards', cardType: 'reward' },
  { path: '/darkmoon-prizes', cardType: 'darkmoon-prize' },
  { path: '/timewarped-cards', cardType: null, timewarped: true },
];
const PAGE_SIZE = 200;
/** The largest list (minions and tavern spells) is about 1,400 cards; the cap only stops a runaway pager. */
const MAX_PAGES = 20;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const httpUrl = (value: unknown) => (/^https:\/\//i.test(text(value)) ? text(value) : null);

function catalogCard(row: Row, library: (typeof LIBRARIES)[number]): BattlegroundCatalogCard | null {
  const id = text(row.card_id);
  const name = (row.name ?? {}) as Row;
  const ru = text(name.ru);
  if (!id || !ru) return null;
  const images = (row.images ?? {}) as Row;
  const slug = text((row.card_type as Row | undefined)?.slug).toLowerCase();
  return {
    id,
    ru,
    en: text(name.en),
    cardType: library.cardType ?? (slug === 'spell' ? 'spell' : 'minion'),
    group: text((row.group as Row | undefined)?.slug) || null,
    timewarped: library.timewarped === true,
    renderUrl: httpUrl(images.card) ?? httpUrl(images.hero),
  };
}

/** Reads every catalog list page by page; a list that fails is left out, the others still resolve names. */
export async function loadBattlegroundCatalog(fetchJson: (url: string) => Promise<unknown>, baseUrl: string): Promise<BattlegroundCatalogCard[]> {
  const lists = await Promise.all(LIBRARIES.map(async library => {
    const cards: BattlegroundCatalogCard[] = [];
    try {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const payload = await fetchJson(`${baseUrl}${library.path}?per_page=${PAGE_SIZE}&page=${page}`) as { data?: unknown; pagination?: { has_next?: unknown } };
        const rows = Array.isArray(payload?.data) ? payload.data as Row[] : [];
        for (const row of rows) {
          const card = catalogCard(row, library);
          if (card) cards.push(card);
        }
        if (payload?.pagination?.has_next !== true || rows.length === 0) break;
      }
    } catch {
      // Partial lists are kept: a missing page only leaves some names unresolved.
    }
    return cards;
  }));
  return lists.flat();
}

/**
 * The catalog changes with game patches, not every half hour: one copy is
 * kept for `ttlMs`, and a failed reload keeps serving the last good copy.
 */
export function createBattlegroundCatalogLoader(dependencies: {
  fetchJson: (url: string) => Promise<unknown>; baseUrl: string; ttlMs: number; now?: () => number;
}) {
  const now = dependencies.now ?? Date.now;
  let cached: { cards: BattlegroundCatalogCard[]; expiresAt: number } | null = null;
  return async (): Promise<BattlegroundCatalogCard[]> => {
    if (cached && cached.expiresAt > now()) return cached.cards;
    const cards = await loadBattlegroundCatalog(dependencies.fetchJson, dependencies.baseUrl);
    if (cards.length > 0 || !cached) cached = { cards, expiresAt: now() + dependencies.ttlMs };
    return cached.cards;
  };
}

const nameKey = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[’‘`]/g, "'")
  .replace(/\s+/g, ' ').trim();

const TYPE_ORDER = ['minion', 'spell', 'trinket', 'hero', 'dark-gift', 'anomaly', 'quest', 'reward', 'darkmoon-prize'];
const rank = (card: BattlegroundCatalogCard) => (card.timewarped ? 100 : 0) + TYPE_ORDER.indexOf(card.cardType);

/**
 * Battlegrounds names by Russian or English spelling. Lesser and greater
 * trinkets share a name, so the article's list heading ("Малый аксессуар")
 * picks one; the hero armor table picks heroes; otherwise a regular card wins
 * over its Timewarped copy.
 */
export function createBattlegroundNameResolver(cards: BattlegroundCatalogCard[]): PatchCardResolver {
  const byName = new Map<string, BattlegroundCatalogCard[]>();
  for (const card of cards) {
    for (const spelling of new Set([nameKey(card.ru), card.en ? nameKey(card.en) : ''])) {
      if (!spelling) continue;
      const list = byName.get(spelling) ?? [];
      if (!list.some(known => known.id === card.id)) list.push(card);
      byName.set(spelling, list);
    }
  }
  return (name, context) => {
    const candidates = byName.get(nameKey(name));
    if (!candidates?.length) return null;
    const subtitle = context?.subtitle ?? '';
    const wanted = /броня героя/i.test(subtitle) ? (card: BattlegroundCatalogCard) => card.cardType === 'hero'
      : /малый/i.test(subtitle) ? (card: BattlegroundCatalogCard) => card.group === 'lesser'
        : /большой/i.test(subtitle) ? (card: BattlegroundCatalogCard) => card.group === 'greater'
          : null;
    const pool = wanted ? candidates.filter(wanted) : candidates;
    const card = [...(pool.length ? pool : candidates)].sort((left, right) => rank(left) - rank(right))[0];
    return { id: card.id, cardClass: null, cardType: card.cardType, name: card.ru, renderUrl: card.renderUrl };
  };
}
