import type { Request, Response } from 'express';

export function sendDatasetJsonCached(
  request: Request,
  response: Response,
  data: any,
  etag: string,
  cacheHeader: string,
  source?: string,
) {
  const guarded = Boolean(response.locals.subscriptionGuarded);
  response.set('Cache-Control', guarded ? cacheHeader.replace(/^public\b/i, 'private') : cacheHeader);
  if (guarded) {
    response.vary('Cookie');
    response.vary('Authorization');
  }
  response.set('ETag', etag);
  if (source) response.set('X-Data-Cache', source);
  if (request.headers['if-none-match'] === etag) return response.status(304).end();
  return response.json(data);
}
