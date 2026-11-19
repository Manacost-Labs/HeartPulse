import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CARD_IMAGE_REPAIR_REVISION, isCardImageRepairCard } from '../shared/cardImageRepairs.js';

export type CardDbfIndex = {
  byCardId: ReadonlyMap<string, number>;
  byDbf: ReadonlyMap<number, string>;
};

export type CardImageDbfSelection = {
  dbfId: number | null;
  source: 'hearthstonejson' | 'legacy' | 'none';
};

type FetchLike = typeof fetch;

export const HEARTHSTONEJSON_CARD_DBF_URL = 'https://api.hearthstonejson.com/v1/latest/enUS/cards.json';

function positive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function buildCardDbfIndex(cards: unknown): CardDbfIndex {
  const byCardId = new Map<string, number>();
  const byDbf = new Map<number, string>();
  for (const card of Array.isArray(cards) ? cards : []) {
    const id = typeof card?.id === 'string' ? card.id.trim() : '';
    const dbfId = positive(card?.dbfId);
    if (!id || !dbfId) continue;
    byCardId.set(id, dbfId);
    byDbf.set(dbfId, id);
  }
  return { byCardId, byDbf };
}

const stripCoreTwin = (id: string) => id.replace(/^CORE_/, '');

/**
 * dbf для картинки Blizzard. Авторитетный источник — HearthstoneJSON (полный
 * cards.json, включая токены). dbf из cards_ru.json — запасной: он устарел и
 * для токенов t1/t2 был сдвинут, поэтому ему не верим, если этот dbf в
 * HearthstoneJSON принадлежит другой карте.
 */
export function selectCardImageDbf(options: {
  cardId: string;
  index: CardDbfIndex | null;
  legacyDbfId: number | null;
  onMismatch?: (message: string) => void;
}): CardImageDbfSelection {
  const { cardId, index, onMismatch } = options;
  const legacyDbfId = positive(options.legacyDbfId);
  if (!index) return legacyDbfId ? { dbfId: legacyDbfId, source: 'legacy' } : { dbfId: null, source: 'none' };

  const authoritative = index.byCardId.get(cardId);
  if (authoritative) {
    if (legacyDbfId && legacyDbfId !== authoritative) {
      onMismatch?.(`${cardId}: dbf ${legacyDbfId} из cards_ru.json заменён на ${authoritative} из HearthstoneJSON`);
    }
    return { dbfId: authoritative, source: 'hearthstonejson' };
  }

  if (!legacyDbfId) return { dbfId: null, source: 'none' };
  const owner = index.byDbf.get(legacyDbfId);
  if (owner && stripCoreTwin(owner) !== stripCoreTwin(cardId)) {
    onMismatch?.(`${cardId}: dbf ${legacyDbfId} принадлежит ${owner}, картинка Blizzard не используется`);
    return { dbfId: null, source: 'none' };
  }
  return { dbfId: legacyDbfId, source: 'legacy' };
}

export function createCardDbfIndexLoader(options: {
  url?: string;
  fetchImpl?: FetchLike;
  now?: () => number;
  ttlMs?: number;
  retryMs?: number;
  onError?: (error: unknown) => void;
} = {}): () => Promise<CardDbfIndex | null> {
  const url = options.url ?? HEARTHSTONEJSON_CARD_DBF_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
  const retryMs = options.retryMs ?? 5 * 60 * 1000;
  let index: CardDbfIndex | null = null;
  let expiresAt = 0;
  let retryAt = 0;
  let pending: Promise<CardDbfIndex | null> | null = null;

  return async () => {
    if (index && expiresAt > now()) return index;
    if (retryAt > now()) return index;
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetchImpl(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error(`HearthstoneJSON HTTP ${response.status}`);
        const next = buildCardDbfIndex(await response.json());
        if (next.byCardId.size === 0) throw new Error('HearthstoneJSON card list is empty');
        index = next;
        expiresAt = now() + ttlMs;
        retryAt = 0;
      } catch (error) {
        options.onError?.(error);
        retryAt = now() + retryMs;
        // Прошлый индекс лучше устаревшего cards_ru.json: оставляем его.
      }
      return index;
    })().finally(() => { pending = null; });
    return pending;
  };
}

/**
 * Адресный сброс кеша (#472): у карт из списка один раз удаляет старый blizzard-файл
 * с чужой картинкой; после успешной перекачки `complete()` пишет маркер.
 */
export function beginCardImageRepair(options: {
  cacheDir: string;
  cardId: string;
  variant: string;
  blizzardPath: string;
}): { pending: boolean; complete: () => void } {
  if (!isCardImageRepairCard(options.cardId)) return { pending: false, complete: () => {} };
  const marker = join(options.cacheDir, `.repair-${CARD_IMAGE_REPAIR_REVISION}-${options.cardId}-${options.variant}`);
  if (existsSync(marker)) return { pending: false, complete: () => {} };
  rmSync(options.blizzardPath, { force: true });
  return { pending: true, complete: () => writeFileSync(marker, new Date().toISOString()) };
}

const defaultCardDbfIndexLoader = createCardDbfIndexLoader({
  onError: error => console.error('[api/card-image] HearthstoneJSON dbf index failed:', error instanceof Error ? error.message : error),
});

/** dbf для скачивания картинки Blizzard: HearthstoneJSON главнее устаревшего cards_ru.json. */
export async function resolveCardImageDbf(options: {
  cardId: string;
  legacyDbfId: () => Promise<unknown>;
  loadIndex?: () => Promise<CardDbfIndex | null>;
}): Promise<number | null> {
  return selectCardImageDbf({
    cardId: options.cardId,
    index: await (options.loadIndex ?? defaultCardDbfIndexLoader)(),
    legacyDbfId: positive(await options.legacyDbfId()),
    onMismatch: message => console.warn('[api/card-image] dbf mismatch:', message),
  }).dbfId;
}
