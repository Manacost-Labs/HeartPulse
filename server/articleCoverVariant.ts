import sharp from 'sharp';
import { optimizeBattlegroundImage } from './battlegroundImageOptimization.js';

/** Text on covers stays legible at this quality; part of every variant validator. */
export const ARTICLE_COVER_VARIANT_ENCODING = 'webp-q78-v1';
const VARIANT_QUALITY = 78;
const TRANSFORMABLE_TYPE = /^image\/(?:jpeg|png|webp|avif)(?:;|$)/i;

export function isTransformableCoverType(contentType: string): boolean {
  return TRANSFORMABLE_TYPE.test(contentType);
}

/** A WebP no wider than `width`, or null for an animated source, which a resize would cut to its first frame. */
export async function encodeArticleCoverVariant(source: Buffer, width: number): Promise<Buffer | null> {
  const { pages = 1 } = await sharp(source).metadata();
  if (pages > 1) return null;
  const { body } = await optimizeBattlegroundImage(source, { width, quality: VARIANT_QUALITY, format: 'webp' });
  return body;
}

/**
 * Runs at most `limit` tasks at once and queues the rest in arrival order.
 * sharp works on the libuv thread pool that file, DNS and crypto work share,
 * so a burst of cache misses must not occupy all of it. A finishing task hands
 * its slot straight to the next waiter, so a newcomer cannot slip in between.
 */
export function createConcurrencyLimit(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active < limit) active += 1;
    else await new Promise<void>(resolve => waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}
