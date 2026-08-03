import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createDeckRenderRouter } from '../server/deckRenderRoutes.js';

async function withServer(
  render: (deckCode: string, deckName: string) => Promise<{
    imageUrl: string | null;
    previewImageUrl?: string | null;
    ready: boolean;
  }>,
  run: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use('/api', createDeckRenderRouter({ render }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server address unavailable');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

let received: [string, string] | null = null;
await withServer(async (deckCode, deckName) => {
  received = [deckCode, deckName];
  return {
    ready: true,
    imageUrl: 'https://api.blizzcore.ru/static/generated/render-cache/ab/result.jpg',
    previewImageUrl: 'https://api.blizzcore.ru/static/generated/render-cache/ab/result.preview-v1.webp',
  };
}, async baseUrl => {
  const response = await fetch(`${baseUrl}/api/deck/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckCode: 'AAECAaoITestDeckCode===', deckName: '  Контроль   Жрец  ' }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    ready: true,
    renderer: 'rust',
    style: 'parchment',
    imageUrl: 'https://api.blizzcore.ru/static/generated/render-cache/ab/result.jpg',
    previewImageUrl: 'https://api.blizzcore.ru/static/generated/render-cache/ab/result.preview-v1.webp',
  });
});
assert.deepEqual(received, ['AAECAaoITestDeckCode===', 'Контроль Жрец']);

await withServer(async () => ({ ready: true, imageUrl: 'unused' }), async baseUrl => {
  const response = await fetch(`${baseUrl}/api/deck/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckCode: '../bad' }),
  });
  assert.equal(response.status, 400);
});

console.log('Deck render route tests passed');
