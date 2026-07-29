import { createReadStream, statSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { Router, type Request, type Response } from 'express';

export type CardImageVariant = 'thumb' | 'full' | 'tile';
export type CardImageSource = 'blizzard' | 'fallback' | 'placeholder';
export type CardImageResult = { path: string; source: CardImageSource };

export type CardImageRouterDependencies = {
  ensureImage: (cardId: string, variant: CardImageVariant) => Promise<CardImageResult>;
  isAllowedPath: (path: string) => boolean;
  statFile?: (path: string) => { mtimeMs: number; size: number };
  openStream?: (path: string) => Readable;
  immutableCacheHeader?: string;
  fallbackCacheHeader?: string;
  onError?: (scope: 'resolve' | 'stream', error: unknown) => void;
};

export type CardImageResponseOptions = {
  immutableCacheHeader?: string;
  fallbackCacheHeader?: string;
  unavailableBody?: unknown;
};

export type CardImageResponder = (
  request: Request,
  response: Response,
  cardId: string,
  variant: CardImageVariant,
  options?: CardImageResponseOptions,
) => Promise<void>;

export function normalizeCardImageId(value: unknown): string | null {
  const cardId = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(cardId) || cardId.length > 80) return null;
  return cardId;
}

/**
 * Creates the shared binary image response pipeline. Route modules validate
 * their own public URL contract and delegate cache/path/stream handling here.
 */
export function createCardImageResponder(
  dependencies: CardImageRouterDependencies,
): CardImageResponder {
  const statFile = dependencies.statFile ?? statSync;
  const openStream = dependencies.openStream ?? createReadStream;
  const immutableCacheHeader = dependencies.immutableCacheHeader ?? 'public, max-age=2592000, immutable';
  const fallbackCacheHeader = dependencies.fallbackCacheHeader ?? 'public, max-age=300, stale-while-revalidate=3600';

  return async (request, response, cardId, variant, options = {}) => {
    const responseImmutableCacheHeader = options.immutableCacheHeader ?? immutableCacheHeader;
    const responseFallbackCacheHeader = options.fallbackCacheHeader ?? fallbackCacheHeader;
    const unavailableBody = options.unavailableBody ?? { error: 'Card image unavailable' };
    try {
      const image = await dependencies.ensureImage(cardId, variant);
      if (!dependencies.isAllowedPath(image.path)) throw new Error('Resolved image path is outside cache root');
      const stat = statFile(image.path);
      const etag = `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`;

      response.set('Content-Type', 'image/webp');
      response.set('Content-Length', String(stat.size));
      response.set('X-Card-Image-Source', image.source);
      response.set(
        'Cache-Control',
        image.source === 'placeholder'
          ? responseFallbackCacheHeader
          : responseImmutableCacheHeader,
      );
      response.set('ETag', etag);
      if (request.headers['if-none-match'] === etag) {
        response.status(304).end();
        return;
      }

      const stream = openStream(image.path);
      stream.once('error', error => {
        dependencies.onError?.('stream', error);
        if (!response.headersSent) {
          response.removeHeader('Content-Length');
          response.set('Cache-Control', 'no-store');
          response.status(502).json(unavailableBody);
        } else {
          response.destroy(error instanceof Error ? error : undefined);
        }
      });
      stream.pipe(response);
    } catch (error) {
      dependencies.onError?.('resolve', error);
      response.removeHeader('Content-Length');
      response.set('Cache-Control', 'no-store');
      response.status(502).json(unavailableBody);
    }
  };
}

export function createCardImageRouter(dependencies: CardImageRouterDependencies): Router {
  const router = Router();
  const respond = createCardImageResponder(dependencies);

  router.get('/card-image/:cardId/:variant.webp', async (request, response) => {
    const cardId = normalizeCardImageId(request.params.cardId);
    const variant: CardImageVariant | null = request.params.variant === 'full'
      || request.params.variant === 'thumb'
      || request.params.variant === 'tile'
      ? request.params.variant
      : null;

    if (!cardId || !variant) {
      response.set('Cache-Control', 'no-store');
      return response.status(400).json({ error: 'Invalid card image request' });
    }

    await respond(request, response, cardId, variant);
  });

  return router;
}
