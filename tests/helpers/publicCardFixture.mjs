import http from 'node:http';
import express from 'express';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { startCredentialBackend } from './credentialBackend.mjs';

export async function listenLocal(server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
export async function closeLocal(server) {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}

export async function publicCardFixture() {
  let unavailable = false;
  const cards = Array.from({ length: 3000 }, (_, i) => ({
    card_id: i === 0 ? 'blizzard:12345' : `CARD_QA_${String(i + 1).padStart(4, '0')}`,
    dbf: i === 0 ? 12345 : 20000 + i, name: { ru: `Публичная карта ${i + 1}`, en: `Public Card ${i + 1}` },
    text: { ru: 'Боевой клич: возьмите карту.' }, flavor: { ru: 'Контрольная карточка для локальной проверки.' },
    class: 'MAGE', card_type: { slug: 'MINION', name_ru: 'Существо' }, rarity: 'COMMON', mana_cost: 2,
    attack: 2, health: 3, card_set: 'CORE', collectible: true, mechanics: ['BATTLECRY'], referenced_tags: [],
    images: { card: '/arena-logo-icon.webp' }, formats: [{ slug: 'standard' }, { slug: 'wild' }],
  }));
  const source = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture');
    if (url.pathname.startsWith('/fixture-assets/')) {
      response.setHeader('Content-Type', 'image/webp');
      response.end(readFileSync(resolve('public/arena-logo-icon.webp'))); return;
    }
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/v1/constructed-cards') {
      if (unavailable) { response.writeHead(503).end('{"error":"Fixture outage"}'); return; }
      const page = Number(url.searchParams.get('page') || 1);
      response.end(JSON.stringify({ data: cards.slice((page - 1) * 200, page * 200), updated_at: new Date().toISOString(), pagination: { page, total: cards.length, total_pages: Math.ceil(cards.length / 200) } }));
    } else if (url.pathname.startsWith('/api/v1/constructed-cards/')) {
      const card = cards.find(card => card.card_id === decodeURIComponent(url.pathname.split('/').at(-1)));
      response.end(JSON.stringify({ data: card ? { ...card, wiki: { patch_changes: [] } } : null }));
    } else if (url.pathname === '/v1/constructed/decks') {
      response.end(JSON.stringify({ data: [], meta: { count: 0, offset: 0, limit: 200 } }));
    } else if (url.pathname.startsWith('/demo/view/')) {
      response.end(JSON.stringify({ fetched_at: new Date().toISOString(), url: 'https://hsreplay.net/cards/', view: { cards: cards.map(card => ({ id: card.card_id, dbfId: card.dbf, deck_popularity: '12.5%', deck_winrate: '53%', times_played: 20000 })) } }));
    } else { response.end(JSON.stringify({ data: [], patches: [], decks: [] })); }
  });
  const externalOrigin = await listenLocal(source);
  let backend;
  try { backend = await startCredentialBackend({ externalOrigin, frontend: true, cardImages: true }); }
  catch (error) { await closeLocal(source); throw error; }
  const app = express();
  app.use(express.static(resolve('dist')));
  app.use((request, response) => {
    if (!request.path.startsWith('/api/') && !request.path.includes('sitemap') && request.path !== '/robots.txt' && !/^\/standard\/cards\/(standard|wild)\/[^/]+\/?$/.test(request.path)) {
      return response.sendFile(resolve('dist/index.html'));
    }
    const upstream = http.request(backend.origin + request.originalUrl, { method: request.method, headers: request.headers }, incoming => {
      response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response);
    });
    upstream.on('error', () => response.status(502).end()); request.pipe(upstream);
  });
  const legacy = http.createServer(app);
  const legacyOrigin = await listenLocal(legacy);
  const session = randomUUID(); const now = new Date().toISOString();
  backend.database.prepare(`INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run('card-reader', 'card-reader@example.test', 'Игрок', 'unused', 'user', now, now);
  backend.database.prepare(`INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(createHash('sha256').update(session).digest('hex'), 'card-reader', 'card-reader@example.test', Date.now() + 3600000, now);
  return {
    backend, legacyOrigin, cookie: `manacost_auth_token=${session}`,
    setUnavailable(value) { unavailable = value; },
    grant() {
      backend.database.prepare(`INSERT INTO manual_subscription_grants (user_id, active, entitlements_json, granted_by, granted_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)`)
        .run('card-reader', '{"standard":true}', 'integration-test', now, now);
    },
    async close() { await closeLocal(legacy); await backend.close(); await closeLocal(source); },
  };
}
