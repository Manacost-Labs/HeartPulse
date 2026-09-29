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
  const reportedGaps = new Set();
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
    // Server rendering reads only JSON. Card images stay with the browser mock,
    // and every answer is re-serialized as JSON so a fixture that echoes a
    // query value can never be served as markup.
    const answered = !url.pathname.startsWith('/api/card-image/')
      && handle({ url, method: request.method, postData }, answer => {
        response.status(answer.status ?? 200).set(answer.headers ?? {});
        if (answer.body) response.json(JSON.parse(answer.body));
        else response.end();
      });
    if (!answered) {
      // Logged once so a fixture gap is visible; the page sees an ordinary miss.
      const gap = `${request.method} ${url.pathname}`;
      if (!reportedGaps.has(gap)) console.warn(`[qa-backend] no fixture for ${gap}`);
      reportedGaps.add(gap);
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
