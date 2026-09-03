import { createHash } from 'node:crypto';
import {
  isIndexableConstructedCard,
  projectPublicConstructedCardSeoData,
} from './constructedCardSeoRoutes.js';
import {
  canonicalBattlegroundCardSlug,
  projectPublicBattlegroundLibraryCard,
  type BattlegroundLibraryKind,
} from './battlegroundLibrarySeoRoutes.js';
import { projectPublicBattlegroundHero } from './battlegroundSeoRoutes.js';
import type { SitemapSemanticEntry } from './entitySitemapStore.js';

type JsonRecord = Record<string, unknown>;

export function canonicalSitemapOrigin(value: string | undefined): string {
  try {
    const parsed = new URL(value ?? 'https://hearthpulse.net');
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('unsupported protocol');
    return parsed.origin;
  } catch {
    return 'https://hearthpulse.net';
  }
}

export function projectConstructedCardSitemapCatalog(
  cards: unknown[],
  format: 'standard' | 'wild',
  originValue?: string,
): SitemapSemanticEntry[] {
  if (!Array.isArray(cards)) return [];
  const origin = canonicalSitemapOrigin(originValue);
  const counts = new Map<string, number>();
  const dbfOwners = new Map<number, string>();
  for (const raw of cards) {
    const card = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as JsonRecord : {};
    const id = typeof card.card_id === 'string' ? card.card_id.trim() : '';
    if (card.catalogPending === true) continue;
    if (!isIndexableConstructedCard(card)) throw new Error('Constructed card sitemap catalog contains an invalid entity');
    counts.set(id, (counts.get(id) ?? 0) + 1);
    const dbf = Number(card.dbf);
    if (Number.isSafeInteger(dbf) && dbf > 0) {
      const owner = dbfOwners.get(dbf);
      if (owner && owner !== id) throw new Error('Constructed card sitemap catalog contains a DBF alias collision');
      dbfOwners.set(dbf, id);
    }
  }
  if ([...counts.values()].some(count => count !== 1)) {
    throw new Error('Constructed card sitemap catalog contains a duplicate canonical ID');
  }
  return cards.flatMap(raw => {
    const card = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as JsonRecord : {};
    if (card.catalogPending === true) return [];
    const projection = projectPublicConstructedCardSeoData(card, origin);
    const semanticHash = createHash('sha256').update(JSON.stringify(projection)).digest('hex');
    return [{
      key: projection.id,
      location: `${origin}/standard/cards/${format}/${encodeURIComponent(projection.id)}/`,
      semanticHash,
    }];
  }).sort((left, right) => left.key.localeCompare(right.key, 'en'));
}

export function projectStandardCardSitemapCatalog(cards: unknown[], originValue?: string) {
  return projectConstructedCardSitemapCatalog(cards, 'standard', originValue);
}

export function projectBattlegroundLibrarySitemapCatalog(
  cards: unknown[],
  kind: BattlegroundLibraryKind,
  originValue?: string,
): SitemapSemanticEntry[] {
  if (!Array.isArray(cards)) return [];
  const origin = canonicalSitemapOrigin(originValue);
  const entries = cards.map(raw => {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as JsonRecord : {};
    const card = projectPublicBattlegroundLibraryCard(source, kind, source.in_pool === true);
    if (!card) throw new Error(`Battleground ${kind} sitemap catalog contains an invalid entity`);
    return {
      key: String(card.dbfId),
      location: new URL(
        `/library/${kind === 'minion' ? 'minions' : 'spells'}/${canonicalBattlegroundCardSlug(card.nameRu)}-${card.dbfId}/`,
        origin,
      ).href,
      semanticHash: createHash('sha256').update(JSON.stringify(card)).digest('hex'),
    };
  });
  const keys = new Set<string>();
  for (const entry of entries) {
    if (keys.has(entry.key)) throw new Error(`Battleground ${kind} sitemap catalog contains a duplicate entity`);
    keys.add(entry.key);
  }
  return entries.sort((left, right) => left.key.localeCompare(right.key, 'en'));
}

export function projectBattlegroundHeroSitemapCatalog(
  heroes: unknown[],
  originValue?: string,
): SitemapSemanticEntry[] {
  if (!Array.isArray(heroes)) return [];
  const origin = canonicalSitemapOrigin(originValue);
  const entries = new Map<string, SitemapSemanticEntry>();
  for (const raw of heroes) {
    const hero = projectPublicBattlegroundHero(raw);
    if (!hero) throw new Error('Battleground hero sitemap catalog contains an invalid entity');
    const key = String(hero.dbfId);
    const semanticHash = createHash('sha256').update(JSON.stringify(hero)).digest('hex');
    const previous = entries.get(key);
    if (previous && previous.semanticHash !== semanticHash) {
      throw new Error('Battleground hero sitemap catalog contains a conflicting duplicate entity');
    }
    entries.set(key, { key, location: `${origin}/heroes/${hero.dbfId}/`, semanticHash });
  }
  return [...entries.values()].sort((left, right) => left.key.localeCompare(right.key, 'en'));
}
