import express, { type RequestHandler } from 'express';

type JsonBodyParserOptions = {
  defaultLimit?: string | number;
  adminUploadMaxBytes: number;
  galleryUploadMaxBytes: number;
};

type UploadAuthorizationGuardOptions = {
  galleryAccessStatus: (req: express.Request) => 401 | 403 | null;
  adminImageAllowed: (req: express.Request) => boolean;
};

function largeJsonRoute(req: express.Request): 'admin-image' | 'gallery' | null {
  if (req.method !== 'POST') return null;
  try {
    const pathname = new URL(req.originalUrl || req.url, 'http://local.invalid').pathname;
    if (pathname === '/api/admin/uploads/image') return 'admin-image';
    if (pathname === '/api/admin/gallery') return 'gallery';
  } catch {
    return null;
  }
  return null;
}

export function jsonLimitForBase64Binary(maxBinaryBytes: number): number {
  const safeBytes = Math.max(0, Number(maxBinaryBytes) || 0);
  return Math.ceil(safeBytes * 4 / 3) + 256 * 1024;
}

export function createRouteAwareJsonParser(options: JsonBodyParserOptions): RequestHandler {
  const defaultParser = express.json({ limit: options.defaultLimit || '1mb' });
  const adminImageParser = express.json({ limit: jsonLimitForBase64Binary(options.adminUploadMaxBytes) });
  const galleryImageParser = express.json({ limit: jsonLimitForBase64Binary(options.galleryUploadMaxBytes) });

  return (req, res, next) => {
    const route = largeJsonRoute(req);
    if (route === 'admin-image') {
      return adminImageParser(req, res, next);
    }
    if (route === 'gallery') {
      return galleryImageParser(req, res, next);
    }
    return defaultParser(req, res, next);
  };
}

export function createUploadAuthorizationGuard(options: UploadAuthorizationGuardOptions): RequestHandler {
  return (req, res, next) => {
    const route = largeJsonRoute(req);
    if (route === 'gallery') {
      const status = options.galleryAccessStatus(req);
      if (status === 401) return res.status(401).json({ error: 'Требуется вход' });
      if (status === 403) return res.status(403).json({ error: 'Доступ запрещён для этого ID' });
    }
    if (route === 'admin-image' && !options.adminImageAllowed(req)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    return next();
  };
}
