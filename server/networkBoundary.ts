import type { Express, Request } from 'express';

/**
 * Production traffic reaches Express through nginx on the loopback interface.
 * Trusting only that hop makes Express select the right-most untrusted address
 * from X-Forwarded-For instead of accepting a client-supplied left-most value.
 */
export function configureLoopbackProxyTrust(app: Express): void {
  app.set('trust proxy', 'loopback');
}

export function getTrustedClientIp(req: Request): string {
  return String(req.ip || req.socket.remoteAddress || '').trim();
}

export function corsOriginAllowed(
  origin: string,
  appUrl: string,
  allowLocalDevelopmentOrigins: boolean,
): boolean {
  if (!origin) return false;
  try {
    const requested = new URL(origin);
    const application = new URL(appUrl);
    if (requested.origin === application.origin) return true;
    if (!allowLocalDevelopmentOrigins || requested.protocol !== 'http:') return false;
    return requested.hostname === 'localhost' || requested.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
