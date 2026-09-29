import http from 'node:http';
import { once } from 'node:events';
import express from 'express';
import { createQaApiHandler, qaSessionFromCookie } from './mockApi.mjs';

/**
 * Stands in for Express behind the local Next.js runtime. `/api` answers come
 * from the QA fixtures, with the fixture account read from the session cookie
 * as Express would; release files come from `distDir`; any other path gets the
 * Next.js not-found document with a 404, like the production nginx fallback.
 */
export async function startQaBackend({ distDir }) {
  // Server-rendering scenario state; every browser page keeps its own.
  const serverState = {};
  let origin = '';
  let notFoundOrigin = '';
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', express.text({ type: () => true, limit: '2mb' }), (request, response) => {
    const url = new URL(request.originalUrl, origin);
    const handle = createQaApiHandler({
      ...qaSessionFromCookie(request.headers.cookie), adminState: serverState, origin,
    });
    const postData = typeof request.body === 'string' && request.body ? request.body : undefined;
    const answered = handle({ url, method: request.method, postData }, answer => {
      response.writeHead(answer.status ?? 200, {
        ...answer.headers,
        ...(answer.contentType ? { 'content-type': answer.contentType } : {}),
      });
      response.end(answer.body ?? '');
    });
    if (!answered) {
      // Logged so a fixture gap is visible; the page sees an ordinary miss.
      console.warn(`[qa-backend] no fixture for ${request.method} ${url.pathname}`);
      response.status(404).json({ error: 'Not found' });
    }
  });
  app.use(express.static(distDir, { index: false, redirect: false }));
  app.use(async (request, response) => {
    const page = notFoundOrigin
      ? await fetch(new URL('/404.html', notFoundOrigin)).then(answer => answer.text(), () => '')
      : '';
    response.status(404).type('html').send(page);
  });
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    /** Serves unknown paths with this Next.js origin's not-found document. */
    setNotFoundOrigin(value) { notFoundOrigin = value; },
    async close() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
