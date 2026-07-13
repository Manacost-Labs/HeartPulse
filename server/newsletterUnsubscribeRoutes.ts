import { Router, type Request, type Response } from 'express';

export type NewsletterUnsubscribeContact = {
  id: string;
  userId?: string;
  consentStatus: string;
};

export type NewsletterUnsubscribeStore = {
  transaction: <T>(work: () => T) => T;
  updateContact: (contactId: string, timestamp: string) => void;
  updateUser: (userId: string, timestamp: string) => void;
};

export type NewsletterUnsubscribeDependencies = {
  resolveContact: (token: string) => NewsletterUnsubscribeContact | null;
  unsubscribe: (contact: NewsletterUnsubscribeContact, timestamp: string) => void;
  escapeHtml: (value: unknown) => string;
  setPrivateNoStore: (response: Response) => void;
  now?: () => Date;
};

const CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const privateHead = '<meta charset="utf-8"><meta name="referrer" content="no-referrer">';
const invalidHtml = `<!doctype html>${privateHead}<title>Ссылка недействительна</title><p>Ссылка отписки недействительна или устарела.</p>`;
const failedHtml = `<!doctype html>${privateHead}<title>Ошибка отписки</title><p>Не удалось обработать отписку. Повторите попытку позже.</p>`;

export function unsubscribeNewsletterContact(
  store: NewsletterUnsubscribeStore,
  contact: NewsletterUnsubscribeContact,
  timestamp: string,
): void {
  store.transaction(() => {
    store.updateContact(contact.id, timestamp);
    if (contact.userId) store.updateUser(contact.userId, timestamp);
  });
}

function tokenFromRequest(request: Request): string {
  const raw = String(request.body?.token ?? request.query.token ?? '').trim();
  return raw.length <= 512 ? raw : '';
}

function isOneClick(request: Request): boolean {
  return String(request.body?.['List-Unsubscribe'] ?? '') === 'One-Click'
    || String(request.headers['list-unsubscribe-post'] ?? '') === 'List-Unsubscribe=One-Click';
}

export function createNewsletterUnsubscribeRouter(dependencies: NewsletterUnsubscribeDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());
  const protect = (response: Response) => {
    dependencies.setPrivateNoStore(response);
    response.set('Content-Security-Policy', CSP);
    response.set('Referrer-Policy', 'no-referrer');
    response.set('X-Content-Type-Options', 'nosniff');
  };

  router.get('/newsletter/unsubscribe', (request, response) => {
    protect(response);
    const token = tokenFromRequest(request);
    if (!token) return response.status(400).type('html').send(invalidHtml);
    let contact: NewsletterUnsubscribeContact | null;
    try {
      contact = dependencies.resolveContact(token);
    } catch {
      return response.status(500).type('html').send(failedHtml);
    }
    if (!contact) return response.status(400).type('html').send(invalidHtml);
    const alreadyUnsubscribed = contact.consentStatus === 'unsubscribed' || contact.consentStatus === 'suppressed';
    const safeToken = dependencies.escapeHtml(token);
    return response.type('html').send(`<!doctype html>
      <html lang="ru"><head>${privateHead}<meta name="viewport" content="width=device-width,initial-scale=1"><title>Отписка от Manacost</title>
      <style>body{margin:0;background:#eef3f8;color:#1d2c3a;font:16px/1.5 Arial,sans-serif}.card{width:min(92%,520px);margin:10vh auto;padding:28px;border:1px solid #cad7e4;border-radius:12px;background:#fff}button{min-height:44px;padding:0 18px;border:0;border-radius:6px;background:#0d6fae;color:#fff;font-weight:700;cursor:pointer}</style></head>
      <body><main class="card"><h1>${alreadyUnsubscribed ? 'Вы уже отписаны' : 'Отписаться от рассылки?'}</h1>
      <p>${alreadyUnsubscribed ? 'Новые письма на этот адрес отправляться не будут.' : 'После подтверждения мы сохраним адрес только в списке исключений, чтобы больше не отправлять письма.'}</p>
      ${alreadyUnsubscribed ? '' : `<form method="post" action="/api/newsletter/unsubscribe"><input type="hidden" name="token" value="${safeToken}"><button type="submit">Подтвердить отписку</button></form>`}
      </main></body></html>`);
  });

  router.post('/newsletter/unsubscribe', (request, response) => {
    protect(response);
    const oneClick = isOneClick(request);
    const token = tokenFromRequest(request);
    if (!token) return response.status(400).json({ error: 'Ссылка отписки недействительна' });
    let contact: NewsletterUnsubscribeContact | null;
    try {
      contact = dependencies.resolveContact(token);
    } catch {
      return response.status(500).json({ error: 'Не удалось обработать отписку' });
    }
    if (!contact) return response.status(400).json({ error: 'Ссылка отписки недействительна' });
    try {
      dependencies.unsubscribe(contact, now().toISOString());
    } catch {
      return response.status(500).json({ error: 'Не удалось обработать отписку' });
    }
    if (oneClick) return response.json({ success: true });
    return response.type('html').send(`<!doctype html>${privateHead}<title>Вы отписались</title><p>Готово. Новые письма Manacost на этот адрес отправляться не будут.</p>`);
  });

  return router;
}
