import {
  normalizeConstructedHeroClass,
  type ConstructedDeckFormat as DeckFormat,
  type ConstructedHeroClass as HeroClass,
} from './constructedDeckCode';
import type { DeckBuilderEntry } from './deckBuilderRules';
import type { DeckListSideboard } from './decklist/DeckListView';

export const DECK_BUILDER_DRAFT_KEY = 'manacost:deck-builder:draft:v1';

export type DeckBuilderDraft = {
  schemaVersion: 1;
  heroClass: HeroClass;
  format: DeckFormat;
  entries: DeckBuilderEntry[];
  sideboards: DeckListSideboard[];
};

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isEntry(value: unknown): value is DeckBuilderEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return Number.isSafeInteger(entry.dbfId)
    && Number(entry.dbfId) > 0
    && Number(entry.dbfId) <= 10_000_000
    && Number.isSafeInteger(entry.count)
    && Number(entry.count) > 0
    && Number(entry.count) <= 2
    && Number.isFinite(Number(entry.cost))
    && typeof entry.id === 'string'
    && typeof entry.name === 'string'
    && typeof entry.rarity === 'string'
    && typeof entry.image === 'string'
    && typeof entry.cardImage === 'string';
}

function safeEntries(value: unknown): DeckBuilderEntry[] | null {
  if (!Array.isArray(value) || value.length > 100 || !value.every(isEntry)) return null;
  return value.map(entry => ({ ...entry }));
}

function safeSideboards(value: unknown): DeckListSideboard[] {
  if (!Array.isArray(value) || value.length > 20) return [];
  return value.flatMap(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const sideboard = raw as Record<string, unknown>;
    const keyCardDbfId = Number(sideboard.keyCardDbfId);
    const cards = safeEntries(sideboard.cards);
    if (!Number.isSafeInteger(keyCardDbfId) || keyCardDbfId <= 0 || !cards?.length) return [];
    return [{
      keyCardDbfId,
      label: String(sideboard.label ?? '').slice(0, 160),
      cards,
    }];
  });
}

export function readDeckBuilderDraft(storage: DraftStorage): DeckBuilderDraft | null {
  try {
    const raw = storage.getItem(DECK_BUILDER_DRAFT_KEY);
    if (!raw || raw.length > 500_000) return null;
    const value = JSON.parse(raw) as Record<string, unknown>;
    const heroClass = normalizeConstructedHeroClass(value.heroClass);
    const format: DeckFormat | null = value.format === 'wild'
      ? 'wild'
      : value.format === 'standard' ? 'standard' : null;
    const entries = safeEntries(value.entries);
    if (value.schemaVersion !== 1 || !heroClass || !format || !entries) return null;
    return {
      schemaVersion: 1,
      heroClass,
      format,
      entries,
      sideboards: safeSideboards(value.sideboards),
    };
  } catch {
    return null;
  }
}

export function writeDeckBuilderDraft(
  storage: DraftStorage,
  draft: Omit<DeckBuilderDraft, 'schemaVersion'>,
): boolean {
  try {
    storage.setItem(DECK_BUILDER_DRAFT_KEY, JSON.stringify({ schemaVersion: 1, ...draft }));
    return true;
  } catch {
    return false;
  }
}

export function clearDeckBuilderDraft(storage: DraftStorage): void {
  try {
    storage.removeItem(DECK_BUILDER_DRAFT_KEY);
  } catch {
    // A private or quota-restricted browser may deny storage access.
  }
}
