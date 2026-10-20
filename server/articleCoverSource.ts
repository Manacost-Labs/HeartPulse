import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Request } from 'express';
import type { ArticleCoverFormat } from './articleCoverVariant.js';

// Request parsing and source reading for server/articleCoverRoutes.ts.

/**
 * Widths `?w=` may request. Any other value is rejected, so the number of
 * re-encodes and cache entries per cover stays bounded. The article UI
 * (src/modules/articles, src/modules/home) builds its srcset from the same
 * list; tests/article-cover-markup.test.tsx keeps the copies equal.
 */
export const ARTICLE_COVER_WIDTHS = [480, 720, 960] as const;

/** The only names server/adminImageUploadRoutes.ts generates; anything else could leave the upload directory. */
export const UPLOAD_NAME = /^[a-z0-9-]+\.webp$/;

export type CoverVariant = { width: number | null; format: ArticleCoverFormat };

/** `readUpload` for the admin upload directory. The router admits only generated names, so the join stays inside it. */
export function adminUploadReader(directory: string): (name: string) => Promise<Buffer | null> {
  return name => readFile(join(directory, name)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
}

export function parseAllowedUrl(value: string, allowedHosts: ReadonlySet<string>): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return allowedHosts.has(url.hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
}

/** `null` asks for the original bytes; `false` is a width outside the allowlist. */
function parseCoverWidth(value: unknown): number | null | false {
  if (value === undefined) return null;
  return ARTICLE_COVER_WIDTHS.find(width => String(width) === value) ?? false;
}

/** WebP unless `avif` is asked for; a format is a re-encode, so it needs a width. */
function parseCoverFormat(value: unknown, width: number | null): ArticleCoverFormat | false {
  if (value === undefined) return 'webp';
  return value === 'avif' && width !== null ? 'avif' : false;
}

export function parseVariant(query: Request['query']): CoverVariant | null {
  const width = parseCoverWidth(query.w);
  if (width === false) return null;
  const format = parseCoverFormat(query.format, width);
  return format === false ? null : { width, format };
}

export async function readLimitedBody(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel('article cover exceeds byte limit');
        const error = new Error('Обложка слишком большая');
        error.name = 'ArticleCoverTooLargeError';
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}
