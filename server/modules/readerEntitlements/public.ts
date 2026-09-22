import { timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { json, Router, type ErrorRequestHandler, type Request, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

type PaidSource = 'boosty' | 'patreon';
type StaticClient = { id: string; secret: string; redirectUri: string };
type SubscriptionRow = { subject: string; blocked_at: string | null; checked_at: string | null; boosty_json: string; patreon_json: string };

export interface ReaderEntitlementsOptions {
  database: DatabaseSync;
  clients: StaticClient[];
  allowedSources?: PaidSource[];
  now?: () => number;
}

const MAX_EVIDENCE_AGE_MS = 30 * 60_000;
const SUBJECT = /^[A-Za-z0-9_-]{1,128}$/;
const STAGING_CLIENT = 'manacost-reader-staging';
const QUALIFYING_ENTITLEMENTS = ['arena', 'battlegrounds', 'standard', 'contests', 'guidesArchive', 'arenaArticles', 'battlegroundsArticles'] as const;

function object(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function epoch(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
}

/** Preserves only the provider's documented ISO payment date, including a past date needed to fail closed. */
export function normalizeBoostyPaymentDates(subscriber: unknown): Record<string, never> | { dates: { nextPaymentAt: string | null } } {
  if (!subscriber || typeof subscriber !== 'object' || Array.isArray(subscriber)) return {};
  const dates = (subscriber as Record<string, unknown>).dates;
  if (!dates || typeof dates !== 'object' || Array.isArray(dates)
    || !Object.prototype.hasOwnProperty.call(dates, 'nextPaymentAt')) return {};
  const value = (dates as Record<string, unknown>).nextPaymentAt;
  return { dates: { nextPaymentAt: typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null } };
}

type BoostyExpiry = { kind: 'absent' } | { kind: 'invalid' } | { kind: 'valid'; value: number };

function boostyExpiry(detail: Record<string, unknown>): BoostyExpiry {
  if (!Object.prototype.hasOwnProperty.call(detail, 'dates')) return { kind: 'absent' };
  const dates = detail.dates;
  if (!dates || typeof dates !== 'object' || Array.isArray(dates)
    || !Object.prototype.hasOwnProperty.call(dates, 'nextPaymentAt')) return { kind: 'invalid' };
  const value = epoch((dates as Record<string, unknown>).nextPaymentAt);
  return value === null ? { kind: 'invalid' } : { kind: 'valid', value };
}

function paidEvidence(detail: Record<string, unknown>, source: PaidSource): boolean {
  if (detail.hasAccess !== true || detail.stale === true || detail.grace === true || detail.providerUnavailable === true) return false;
  const entitlements = detail.entitlements;
  const qualifyingTier = entitlements && typeof entitlements === 'object' && !Array.isArray(entitlements)
    && QUALIFYING_ENTITLEMENTS.some(key => (entitlements as Record<string, unknown>)[key] === true);
  return Boolean(qualifyingTier && detail.checked === true
    && (source === 'boosty' ? detail.found === true : detail.connected === true));
}

function providerValidity(source: PaidSource, detail: Record<string, unknown>, freshnessUntil: number, now: number): number | null {
  if (!paidEvidence(detail, source)) return null;
  const expiry = source === 'boosty' ? boostyExpiry(detail) : { kind: 'absent' as const };
  if (expiry.kind === 'invalid') return null;
  const validUntil = expiry.kind === 'valid' ? Math.min(freshnessUntil, expiry.value) : freshnessUntil;
  return validUntil >= now ? validUntil : null;
}

function basicCredentials(request: Request): { id: string; secret: string } | null {
  const header = request.get('Authorization') ?? '';
  if (!header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 1) return null;
    return { id: decoded.slice(0, separator), secret: decoded.slice(separator + 1) };
  } catch { return null; }
}

function authorized(request: Request, clients: StaticClient[]): boolean {
  const supplied = basicCredentials(request);
  const client = supplied?.id === STAGING_CLIENT ? clients.find(item => item.id === supplied.id) : undefined;
  if (!supplied || !client) return false;
  const expected = Buffer.from(client.secret);
  const actual = Buffer.from(supplied.secret);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Returns fail-closed paid status from existing cached provider evidence; it never refreshes providers. */
export function createReaderEntitlementsRouter(options: ReaderEntitlementsOptions) {
  const router = Router();
  const sources = new Set(options.allowedSources ?? ['boosty', 'patreon']);
  const clock = options.now ?? Date.now;
  const privateHeaders: RequestHandler = (_request, response, next) => {
    response.set({ 'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    next();
  };
  const limiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false,
    keyGenerator: request => basicCredentials(request)?.id ?? 'unauthenticated' });
  const authorize: RequestHandler = (request, response, next) => {
    if (request.get('Origin') || request.get('Sec-Fetch-Site') === 'cross-site') { response.status(403).json({ error: 'forbidden' }); return; }
    if (!authorized(request, options.clients)) { response.set('WWW-Authenticate', 'Basic realm="reader-entitlements"'); response.status(401).json({ error: 'unauthorized' }); return; }
    if ((request.get('Content-Type') ?? '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      response.status(415).json({ error: 'invalid_request' }); return;
    }
    next();
  };
  router.post('/reader-entitlements', privateHeaders, authorize, limiter, json({ limit: '4kb', strict: true }), (request, response) => {
    const subjects = request.body?.subjects;
    if (!Array.isArray(subjects) || subjects.length < 1 || subjects.length > 20
      || subjects.some(value => typeof value !== 'string' || !SUBJECT.test(value))
      || new Set(subjects).size !== subjects.length || Object.keys(request.body).length !== 1) {
      response.status(400).json({ error: 'invalid_request' }); return;
    }
    try {
      const placeholders = subjects.map(() => '?').join(',');
      const rows = options.database.prepare(`SELECT u.id AS subject, u.blocked_at, s.checked_at, s.boosty_json, s.patreon_json
        FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id WHERE u.id IN (${placeholders})`).all(...subjects) as SubscriptionRow[];
      const bySubject = new Map(rows.map(row => [row.subject, row]));
      const now = clock();
      const entitlements = subjects.map(subject => {
        const row = bySubject.get(subject);
        const checkedAt = row?.checked_at ? Date.parse(row.checked_at) : Number.NaN;
        const fresh = Boolean(row && !row.blocked_at && Number.isFinite(checkedAt)
          && now - checkedAt >= 0 && now - checkedAt <= MAX_EVIDENCE_AGE_MS);
        let validUntil: number | null = null;
        if (fresh && row) {
          const providerValidities = ([['boosty', row.boosty_json], ['patreon', row.patreon_json]] as const)
            .filter(([source]) => sources.has(source)).map(([source, value]) => [source, object(value)] as const)
            .map(([source, detail]) => providerValidity(source, detail, checkedAt + MAX_EVIDENCE_AGE_MS, now))
            .filter((value): value is number => value !== null);
          validUntil = providerValidities.length ? Math.max(...providerValidities) : null;
        }
        const paid = validUntil !== null;
        return { subject, paid, checkedAt: paid ? checkedAt : null, validUntil: paid ? validUntil : null };
      });
      response.json({ entitlements });
    } catch { response.status(503).json({ error: 'unavailable' }); }
  });
  const bodyError: ErrorRequestHandler = (error, _request, response, next) => {
    void next;
    const status = (error as { type?: string; status?: number }).type === 'entity.too.large' ? 413
      : (error as { status?: number }).status === 415 ? 415 : 400;
    response.status(status).json({ error: 'invalid_request' });
  };
  router.use('/reader-entitlements', bodyError);
  return router;
}
