import sharp from 'sharp';
import { optimizeBattlegroundImage } from './battlegroundImageOptimization.js';

export type ArticleCoverFormat = 'webp' | 'avif';

/**
 * Text on covers stays legible at these settings; each is part of its variant
 * validator. AVIF quality 55 matched the WebP by eye on real covers at about
 * 40 % fewer bytes. Effort 2 kept a 720 px encode near 120 ms of one thread,
 * against about one second at the default effort, for 0.5 % more bytes.
 */
export const ARTICLE_COVER_VARIANT_ENCODING: Record<ArticleCoverFormat, string> = {
  webp: 'webp-q78-v1',
  avif: 'avif-q55-e2-v1',
};
const VARIANT_QUALITY = 78;
const AVIF_QUALITY = 55;
const AVIF_EFFORT = 2;
const MAX_INPUT_PIXELS = 24_000_000;
const TRANSFORMABLE_TYPE = /^image\/(?:jpeg|png|webp|avif)(?:;|$)/i;

export function isTransformableCoverType(contentType: string): boolean {
  return TRANSFORMABLE_TYPE.test(contentType);
}

/** A WebP or AVIF no wider than `width`, or null for an animated source, which a resize would cut to its first frame. */
export async function encodeArticleCoverVariant(source: Buffer, width: number, format: ArticleCoverFormat = 'webp'): Promise<Buffer | null> {
  const { pages = 1 } = await sharp(source).metadata();
  if (pages > 1) return null;
  if (format === 'avif') {
    return sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width, withoutEnlargement: true, fit: 'inside' })
      .avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT })
      .toBuffer();
  }
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
