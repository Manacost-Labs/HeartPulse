import { timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { json, Router, type ErrorRequestHandler, type Request, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

type StaticClient = { id: string; secret: string; redirectUri: string };
type PermissionRow = { subject: string; role: string | null; blocked_at: string | null };

export interface ReaderPermissionsOptions {
  database: DatabaseSync;
  clients: StaticClient[];
}

const STAGING_CLIENT = 'manacost-reader-staging';
const STAGING_CALLBACK = 'https://test.hs-manacost.ru/reader-auth/callback';
const SUBJECT = /^[A-Za-z0-9_-]{1,128}$/;

/** Requires the one Reader bridge credential that deployment must explicitly provision before enabling this route. */
export function assertReaderPermissionsClient(clients: unknown): asserts clients is StaticClient[] {
  const valid = Array.isArray(clients) && clients.some(client => client && typeof client === 'object'
    && (client as StaticClient).id === STAGING_CLIENT
    && (client as StaticClient).redirectUri === STAGING_CALLBACK
    && typeof (client as StaticClient).secret === 'string'
    && (client as StaticClient).secret.length >= 43
    && Buffer.byteLength((client as StaticClient).secret, 'utf8') >= 43);
  if (!valid) throw new Error('Reader permissions staging client is invalid');
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

/** Reads canonical role and block state for each request; it never derives authority from a Reader token or cache. */
export function createReaderPermissionsRouter(options: ReaderPermissionsOptions) {
  const router = Router();
  const privateHeaders: RequestHandler = (_request, response, next) => {
    response.set({ 'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    next();
  };
  const preAuthLimiter = rateLimit({
    windowMs: 60_000, max: 1_200, standardHeaders: true, legacyHeaders: false,
    keyGenerator: () => 'reader-permissions-preauth',
  });
  const authorize: RequestHandler = (request, response, next) => {
    if (request.get('Origin') || request.get('Sec-Fetch-Site') === 'cross-site') { response.status(403).json({ error: 'forbidden' }); return; }
    if (!authorized(request, options.clients)) { response.set('WWW-Authenticate', 'Basic realm="reader-permissions"'); response.status(401).json({ error: 'unauthorized' }); return; }
    if ((request.get('Content-Type') ?? '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') { response.status(415).json({ error: 'invalid_request' }); return; }
    next();
  };
  router.post('/reader-permissions', privateHeaders, preAuthLimiter, authorize,
    rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false,
      keyGenerator: request => basicCredentials(request)?.id ?? 'unauthenticated' }),
    json({ limit: '4kb', strict: true }), (request, response) => {
      const subjects = request.body?.subjects;
      if (!Array.isArray(subjects) || subjects.length < 1 || subjects.length > 20
        || subjects.some(value => typeof value !== 'string' || !SUBJECT.test(value))
        || new Set(subjects).size !== subjects.length || Object.keys(request.body).length !== 1) {
        response.status(400).json({ error: 'invalid_request' }); return;
      }
      try {
        const placeholders = subjects.map(() => '?').join(',');
        const rows = options.database.prepare(`SELECT id AS subject, role, blocked_at FROM users WHERE id IN (${placeholders})`).all(...subjects) as PermissionRow[];
        const bySubject = new Map(rows.map(row => [row.subject, row]));
        response.json({ permissions: subjects.map(subject => {
          const row = bySubject.get(subject);
          return { subject, canModerateComments: row?.role === 'admin' && !row.blocked_at };
        }) });
      } catch { response.status(503).json({ error: 'unavailable' }); }
    });
  const bodyError: ErrorRequestHandler = (error, _request, response, next) => {
    void next;
    const status = (error as { type?: string; status?: number }).type === 'entity.too.large' ? 413
      : (error as { status?: number }).status === 415 ? 415 : 400;
    response.status(status).json({ error: 'invalid_request' });
  };
  router.use('/reader-permissions', bodyError);
  return router;
}
