import express, { type RequestHandler } from 'express';

type JsonBodyParserOptions = {
  defaultLimit?: string | number;
  adminUploadMaxBytes: number;
  galleryUploadMaxBytes: number;
};

export function jsonLimitForBase64Binary(maxBinaryBytes: number): number {
  const safeBytes = Math.max(0, Number(maxBinaryBytes) || 0);
  return Math.ceil(safeBytes * 4 / 3) + 256 * 1024;
}

export function createRouteAwareJsonParser(options: JsonBodyParserOptions): RequestHandler {
  const defaultParser = express.json({ limit: options.defaultLimit || '1mb' });
  const adminImageParser = express.json({ limit: jsonLimitForBase64Binary(options.adminUploadMaxBytes) });
  const galleryImageParser = express.json({ limit: jsonLimitForBase64Binary(options.galleryUploadMaxBytes) });

  return (req, res, next) => {
    let pathname = '';
    try {
      pathname = new URL(req.originalUrl || req.url, 'http://local.invalid').pathname;
    } catch {
      return defaultParser(req, res, next);
    }
    if (req.method === 'POST' && pathname === '/api/admin/uploads/image') {
      return adminImageParser(req, res, next);
    }
    if (req.method === 'POST' && pathname === '/api/admin/gallery') {
      return galleryImageParser(req, res, next);
    }
    return defaultParser(req, res, next);
  };
}
