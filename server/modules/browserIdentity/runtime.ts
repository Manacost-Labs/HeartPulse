import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Router, urlencoded } from 'express';
import rateLimit from 'express-rate-limit';
import type { BrowserIdentityOptions } from './configuration.js';
import { createBrowserIdentityProvider } from './provider.js';
import { createSessionBindings } from './sessionBindings.js';
import { interactionView } from './interactionView.js';

type RuntimeOptions = Omit<BrowserIdentityOptions, 'resolveAccount' | 'resolveBrowserAccount'> & {
  authCookieName: string;
  trustedProxy: boolean;
};

/** This must be mounted before shared body parsers. No WordPress or bearer-token login path is accepted. */
export function createBrowserIdentityRuntime(options: RuntimeOptions) {
  const bindings = createSessionBindings(options.database, options.encryptionKey);
  const origin = new URL(options.issuer).origin;
  const browser = (request: IncomingMessage) => {
    const cookies = (request.headers.cookie ?? '').split(';').map(part => part.trim())
      .filter(part => part.startsWith(`${options.authCookieName}=`));
    if (cookies.length !== 1) return undefined;
    let token: string;
    try { token = decodeURIComponent(cookies[0].slice(options.authCookieName.length + 1)); } catch { return undefined; }
    if (!/^[a-f0-9]{64}$/.test(token)) return undefined;
    const sessionHash = createHash('sha256').update(token).digest('hex');
    const row = options.database.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').get(sessionHash);
    if (!row) return undefined;
    const account = bindings.parent(String(row.user_id), sessionHash);
    return account ? { ...account, sessionHash } : undefined;
  };
  const provider = createBrowserIdentityProvider({ ...options,
    resolveAccount: async (subject, grantId) => bindings.resolve(subject, grantId),
    resolveBrowserAccount: async (subject, request) => {
      const account = browser(request);
      return account?.subject === subject ? account : undefined;
    },
  });
  provider.proxy = options.trustedProxy;
  const router = Router();
  router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
    next();
  });
  router.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));
  const csrf = (uid: string, parent: string) => createHmac('sha256', options.cookieKeys[0]).update(`${uid}:${parent}`).digest('base64url');
  router.all('/interaction/:uid', urlencoded({ extended: false, limit: '4kb' }), async (req, res) => {
    try {
      if (!['GET', 'POST'].includes(req.method)) { res.sendStatus(405); return; }
      const interaction = await provider.interactionDetails(req, res);
      if (interaction.uid !== req.params.uid) { res.sendStatus(400); return; }
      const account = browser(req);
      if (!account) {
        res.redirect(303, `/?login&reader_interaction=${encodeURIComponent(interaction.uid)}`); return;
      }
      const client = options.clients.find(item => item.id === interaction.params.client_id);
      if (!client) { res.sendStatus(400); return; }
      const expected = csrf(interaction.uid, account.sessionHash);
      if (req.method === 'GET') {
        // Native form POSTs need a non-opaque Origin; cross-origin referrers stay suppressed.
        res.set('Referrer-Policy', 'same-origin');
        res.type('html').send(interactionView(account.displayName ?? '', new URL(client.redirectUri).hostname, expected)); return;
      }
      const supplied = typeof req.body?.csrf === 'string' ? req.body.csrf : '';
      if (req.get('Origin') !== origin || req.get('Sec-Fetch-Site') === 'cross-site'
        || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
        res.sendStatus(403); return;
      }
      if (req.body.decision === 'deny') {
        await provider.interactionFinished(req, res, { error: 'access_denied' }, { mergeWithLastSubmission: false }); return;
      }
      if (req.body.decision !== 'continue') { res.sendStatus(400); return; }
      const grant = new provider.Grant({ accountId: account.subject, clientId: client.id });
      grant.addOIDCScope('openid profile');
      const grantId = await grant.save();
      bindings.bind(grantId, account.subject, account.sessionHash);
      await provider.interactionFinished(req, res, {
        login: { accountId: account.subject }, consent: { grantId },
      }, { mergeWithLastSubmission: false });
    } catch { if (!res.headersSent) res.status(400).type('text').send('Вход истёк. Вернитесь на Манакост и начните заново.'); }
  });
  router.use(provider.callback());
  return { router, provider, bindings };
}
