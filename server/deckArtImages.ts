import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { CardImageResult } from './cardImageRoutes.js';

/**
 * Deck-list art for the fun-deck views.
 *
 * `row` is the deck-builder tile that Kolodahs renders (mana gem, outlined
 * name, art, legendary star), cut down from a 640x128 PNG of ~115 KB to a
 * 400x80 WebP of ~7 KB. `portrait` is the square card art behind the round
 * portraits: HearthstoneJSON pads newer art with white bars up to 256x256, so
 * the bars are trimmed before the centre square is taken.
 */
export type DeckArtVariant = 'row' | 'portrait';

export const DECK_ART_CACHE_VERSION = 'deck_art_v1';
export const DECK_ROW_SIZE = { width: 400, height: 80 } as const;
export const DECK_PORTRAIT_SIZE = 96;

const LIGHT_PIXEL = 232;
const LIGHT_LINE_SHARE = 0.6;
const TRIM_INSET = 4;
const MAX_REMEMBERED_FAILURES = 2_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; HearthPulse/1.0; +https://hearthpulse.net)';

type FetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
};
export type DeckArtFetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<FetchResponse>;

export type DeckArtImageDependencies = {
  cacheDir: string;
  /** Kolodahs API base, for example https://api.kolodahearthstone.com/api/v1. */
  catalogBaseUrl: string;
  artBaseUrl?: string;
  fetch?: DeckArtFetch;
  withSlot?: <T>(task: () => Promise<T>) => Promise<T>;
  now?: () => number;
  /** A card the source does not have (404, no deck tile) is not fetched again for this long. */
  failureTtlMs?: number;
  /** A timeout, network error, 429 or 5xx blocks the card only briefly: the source is likely to recover. */
  transientFailureTtlMs?: number;
  timeoutMs?: number;
};

export type SquareCrop = { left: number; top: number; size: number };

/**
 * Finds the square of real art inside a padded image. A border line counts as
 * padding when most of its pixels are near white; a trimmed side also loses a
 * few pixels of the anti-aliased seam.
 */
export function artSquareCrop(pixels: Uint8Array | Buffer, width: number, height: number, channels: number): SquareCrop {
  const lightShare = (start: number, step: number, count: number) => {
    let light = 0;
    for (let index = 0; index < count; index += 1) {
      const offset = (start + index * step) * channels;
      if ((pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3 > LIGHT_PIXEL) light += 1;
    }
    return light / count;
  };
  const padded = (lines: number, isLight: (line: number) => boolean) => {
    let count = 0;
    while (count < lines && isLight(count)) count += 1;
    return count === lines ? 0 : count;
  };
  const top = padded(height, row => lightShare(row * width, 1, width) >= LIGHT_LINE_SHARE);
  const bottom = padded(height, row => lightShare((height - 1 - row) * width, 1, width) >= LIGHT_LINE_SHARE);
  const left = padded(width, column => lightShare(column, width, height) >= LIGHT_LINE_SHARE);
  const right = padded(width, column => lightShare(width - 1 - column, width, height) >= LIGHT_LINE_SHARE);
  const inset = (lines: number) => (lines ? lines + TRIM_INSET : 0);
  const x0 = inset(left);
  const y0 = inset(top);
  const x1 = width - inset(right);
  const y1 = height - inset(bottom);
  if (x1 - x0 < 16 || y1 - y0 < 16) {
    const size = Math.min(width, height);
    return { left: Math.floor((width - size) / 2), top: Math.floor((height - size) / 2), size };
  }
  const size = Math.min(x1 - x0, y1 - y0);
  return {
    left: x0 + Math.floor((x1 - x0 - size) / 2),
    top: y0 + Math.floor((y1 - y0 - size) / 2),
    size,
  };
}

function isKolodaUpload(value: unknown, catalogBaseUrl: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const catalog = new URL(catalogBaseUrl);
    return url.protocol === 'https:' && url.hostname === catalog.hostname && url.pathname.startsWith('/uploads/');
  } catch {
    return false;
  }
}

/** The source answered and has no such art: retrying soon will not help. */
class DeckArtMissingError extends Error {}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function createDeckArtImages(dependencies: DeckArtImageDependencies) {
  const fetchSource: DeckArtFetch = dependencies.fetch ?? (fetch as unknown as DeckArtFetch);
  const withSlot = dependencies.withSlot ?? (<T>(task: () => Promise<T>) => task());
  const now = dependencies.now ?? Date.now;
  const failureTtlMs = dependencies.failureTtlMs ?? 10 * 60_000;
  const transientFailureTtlMs = dependencies.transientFailureTtlMs ?? 60_000;
  const timeoutMs = dependencies.timeoutMs ?? 15_000;
  const artBaseUrl = (dependencies.artBaseUrl ?? 'https://art.hearthstonejson.com/v1/256x').replace(/\/$/, '');
  const catalogBaseUrl = dependencies.catalogBaseUrl.replace(/\/$/, '');
  const jobs = new Map<string, Promise<CardImageResult>>();
  const failedUntil = new Map<string, number>();

  const cachePath = (cardId: string, variant: DeckArtVariant) => {
    const safeId = cardId.replace(/[^A-Za-z0-9_]/g, '').slice(0, 80) || 'unknown';
    return join(dependencies.cacheDir, `${safeId}-${variant}-fallback-${DECK_ART_CACHE_VERSION}.webp`);
  };

  const download = async (url: string): Promise<{ status: number; body: Buffer | null }> => {
    const response = await fetchSource(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { status: response.status, body: null };
    const body = Buffer.from(await response.arrayBuffer());
    return { status: response.status, body: body.length ? body : null };
  };

  const kolodaTile = async (cardId: string): Promise<Buffer> => {
    const response = await fetchSource(`${catalogBaseUrl}/constructed-cards/${encodeURIComponent(cardId)}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const message = `Kolodahs card HTTP ${response.status}`;
      throw response.status === 404 ? new DeckArtMissingError(message) : new Error(message);
    }
    const payload = record(await response.json());
    const card = record(payload.data ?? payload);
    const tile = record(card.images).tile ?? card.tile_image_url;
    if (!isKolodaUpload(tile, catalogBaseUrl)) throw new DeckArtMissingError('Kolodahs card has no deck tile');
    const image = await download(tile);
    if (!image.body) {
      const message = `Kolodahs tile HTTP ${image.status}`;
      throw image.status === 404 ? new DeckArtMissingError(message) : new Error(message);
    }
    return image.body;
  };

  const squareArt = async (cardId: string): Promise<Buffer> => {
    // Core reprints without their own art use the original card's art.
    const candidates = cardId.startsWith('CORE_') ? [cardId, cardId.slice(5)] : [cardId];
    for (const candidate of candidates) {
      const image = await download(`${artBaseUrl}/${encodeURIComponent(candidate)}.jpg`);
      if (image.body) return image.body;
      if (image.status !== 404) throw new Error(`Card art HTTP ${image.status}`);
    }
    throw new DeckArtMissingError('Card art not found');
  };

  const render = async (cardId: string, variant: DeckArtVariant, outPath: string) => {
    if (variant === 'row') {
      await sharp(await kolodaTile(cardId))
        .resize({ ...DECK_ROW_SIZE, fit: 'cover' })
        .webp({ quality: 82, effort: 4 })
        .toFile(outPath);
      return;
    }
    const source = await squareArt(cardId);
    const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const crop = artSquareCrop(data, info.width, info.height, info.channels);
    await sharp(source)
      .extract({ left: crop.left, top: crop.top, width: crop.size, height: crop.size })
      .resize({ width: DECK_PORTRAIT_SIZE, height: DECK_PORTRAIT_SIZE })
      .webp({ quality: 80, effort: 4 })
      .toFile(outPath);
  };

  const ensure = (cardId: string, variant: DeckArtVariant): Promise<CardImageResult> => {
    const outPath = cachePath(cardId, variant);
    if (existsSync(outPath)) return Promise.resolve({ path: outPath, source: 'fallback' });
    const key = `${variant}:${cardId}`;
    const blockedUntil = failedUntil.get(key) ?? 0;
    if (blockedUntil > now()) return Promise.reject(new Error(`Deck ${variant} art recently unavailable`));
    const existing = jobs.get(key);
    if (existing) return existing;
    const job = withSlot(async () => {
      mkdirSync(dependencies.cacheDir, { recursive: true });
      try {
        await render(cardId, variant, outPath);
        failedUntil.delete(key);
        return { path: outPath, source: 'fallback' as const };
      } catch (error) {
        // Unknown ids must not grow the memory without bound: the oldest failure goes first.
        if (failedUntil.size >= MAX_REMEMBERED_FAILURES) failedUntil.delete(failedUntil.keys().next().value as string);
        failedUntil.set(key, now() + (error instanceof DeckArtMissingError ? failureTtlMs : transientFailureTtlMs));
        throw error;
      }
    }).finally(() => jobs.delete(key));
    jobs.set(key, job);
    return job;
  };

  return { ensure, cachePath };
}
