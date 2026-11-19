import { sameOriginPublicResourceUrl } from '@/shared/publicResourceUrl';
import { shareImageUrl } from '@/shared/shareImages';
import type { LibraryIndexingFacts } from '@/shared/battlegroundLibraryIndexing';
import { battlegroundLibraryDetailKind, type BattlegroundLibraryPool } from './battlegroundLibraryDetailKinds';

/** The open figures of the base statistics slice (rating range «Топ 50%», current patch). */
export type PublicLibraryCardStats = {
  avgPlacementWith: number;
  avgPlacementWithout: number | null;
  popularity: number | null;
  gamesWith: number;
  /** Completion time of the run behind the figures, ISO. */
  updatedAt: string | null;
};

export type PublicLibraryRelatedCard = {
  dbfId: number;
  name: string;
  path: string;
  tavernTier: number | null;
  tribe: string | null;
};

export type PublicBattlegroundLibraryCard = {
  dbfId: number;
  kind: 'minion' | 'spell' | 'anomaly' | 'dark_gift' | 'quest' | 'reward' | 'darkmoon_prize' | 'trinket' | 'timewarped';
  name: string;
  typeName: string;
  text: string | null;
  image: string;
  canonicalPath: string;
  tavernTier: number | null;
  tribe: string | null;
  attack: number | null;
  health: number | null;
  mechanics: string[];
  golden: { attack: number | null; health: number | null } | null;
  /** `null` for a card without open statistics (not in the pool, a spell, below the sample). */
  stats: PublicLibraryCardStats | null;
  related: PublicLibraryRelatedCard[];
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const small = (value: unknown, maximum: number): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;
const text = (value: unknown, maximum: number): string => typeof value === 'string' ? value.trim().slice(0, maximum) : '';
const place = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 8 ? Math.round(value * 100) / 100 : null;
const percent = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 100) / 100 : null;

const RELATED_PATH = /^\/library(?:\/archive)?\/(?:minions|spells)\/[a-zа-я0-9-]{1,80}-[1-9][0-9]*\/$/u;

/** Copies the open statistics by name: the impact, win rate, rounds, purchases and positions are not in the type. */
export function parseLibraryCardStats(value: unknown): PublicLibraryCardStats | null {
  const stats = record(value);
  const withMinion = place(stats?.avgPlacementWith);
  const games = Number(stats?.gamesWith);
  if (!stats || withMinion === null || !Number.isSafeInteger(games) || games <= 0) return null;
  const updatedAt = text(stats.updatedAt, 40);
  return {
    avgPlacementWith: withMinion, avgPlacementWithout: place(stats.avgPlacementWithout),
    popularity: percent(stats.popularity), gamesWith: games,
    updatedAt: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
  };
}

/** At most six related cards, each one identity: a hostile answer cannot smuggle a longer list or another path. */
export function parseLibraryRelatedCards(value: unknown): PublicLibraryRelatedCard[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  return value.slice(0, 6).flatMap(entry => {
    const card = record(entry);
    const dbfId = Number(card?.dbfId);
    const name = text(card?.name, 180);
    const path = text(card?.path, 300);
    if (!card || !Number.isSafeInteger(dbfId) || dbfId <= 0 || !name || !RELATED_PATH.test(path)
      || !path.endsWith(`-${dbfId}/`) || seen.has(dbfId)) return [];
    seen.add(dbfId);
    return [{ dbfId, name, path, tavernTier: small(card.tavernTier, 7), tribe: text(card.tribe, 120) || null }];
  });
}

/** Keeps only verified anonymous card identity and open facts in Next HTML and hydration. */
export function publicBattlegroundLibraryCard(value: unknown, kindPath: string, dbfId: string,
  pool: BattlegroundLibraryPool = 'current'): PublicBattlegroundLibraryCard {
  if (!value || typeof value !== 'object' || !('card' in value) || !('canonicalPath' in value)) {
    throw new Error('Invalid public Battleground card projection');
  }
  const root = value as { card: unknown; canonicalPath: unknown; stats?: unknown; related?: unknown };
  if (!root.card || typeof root.card !== 'object') throw new Error('Invalid public Battleground card');
  const card = root.card as Record<string, unknown>;
  const config = battlegroundLibraryDetailKind(kindPath, pool);
  if (!config || card.dbfId !== Number(dbfId) || card.kind !== config.kind
    || typeof card.nameRu !== 'string' || !card.nameRu.trim()
    || typeof card.typeName !== 'string' || !card.typeName.trim()) {
    throw new Error('Invalid public Battleground card identity');
  }
  const canonicalPath = root.canonicalPath;
  const prefix = pool === 'archive' ? '/library/archive' : '/library';
  if (typeof canonicalPath !== 'string'
    || !new RegExp(`^${prefix}/${kindPath}/[a-zа-я0-9-]{1,80}-${dbfId}/$`, 'u').test(canonicalPath)) {
    throw new Error('Invalid public Battleground card canonical path');
  }
  const images = card.images && typeof card.images === 'object' ? card.images as Record<string, unknown> : {};
  const image = sameOriginPublicResourceUrl(images.card ?? images.framed, 'https://hearthpulse.net')
    ?? shareImageUrl('battlegrounds');
  if (card.textRu !== null && typeof card.textRu !== 'string') throw new Error('Invalid public Battleground card text');
  const golden = record(card.golden);
  const goldenAttack = small(golden?.attack, 1000);
  const goldenHealth = small(golden?.health, 1000);
  return {
    dbfId: card.dbfId as number, kind: config.kind, name: card.nameRu,
    typeName: card.typeName, text: card.textRu as string | null,
    image, canonicalPath,
    tavernTier: small(card.tavernTier, 7), tribe: text(card.tribe, 120) || null,
    attack: small(card.attack, 1000), health: small(card.health, 1000),
    mechanics: (Array.isArray(card.mechanics) ? card.mechanics : []).slice(0, 12)
      .map(mechanic => text(mechanic, 120)).filter(Boolean),
    golden: goldenAttack === null && goldenHealth === null ? null : { attack: goldenAttack, health: goldenHealth },
    stats: parseLibraryCardStats(root.stats),
    related: parseLibraryRelatedCards(root.related),
  };
}

/** The facts the open card page states, in the shape of the one indexing rule (`shared/battlegroundLibraryIndexing.ts`). */
export function libraryCardIndexingFacts(card: PublicBattlegroundLibraryCard): LibraryIndexingFacts {
  return {
    name: card.name, typeName: card.typeName, tavernTier: card.tavernTier, tribe: card.tribe,
    attack: card.attack, health: card.health, text: card.text, mechanicCount: card.mechanics.length,
    goldenAttack: card.golden?.attack ?? null, goldenHealth: card.golden?.health ?? null, stats: card.stats,
  };
}
