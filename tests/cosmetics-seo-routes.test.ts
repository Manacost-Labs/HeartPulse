import assert from 'node:assert/strict';
import express from 'express';
import { createCosmeticsSeoRouter } from '../server/cosmeticsSeoRoutes.js';

const app = express();
app.use(createCosmeticsSeoRouter({
  frontendAssets: '<script type="module" src="/assets/app.js"></script>',
  loadDetail: async (_kind, cardId) => {
    if (cardId === 'MISSING') return null;
    if (cardId === 'BROKEN') throw new Error('upstream unavailable');
    return {
      cardId,
      dbf: 120228,
      name: { ru: 'Керриган-арахнид', en: 'Arachnid Kerrigan' },
      class: { nameRu: 'Рыцарь смерти' },
      rarity: { nameRu: 'Мифический' },
      artist: 'Hearthstone Art Team',
      images: { static: 'https://db.kolodahs.ru/uploads/hero-skins/static/HERO_11ai.png' },
    };
  },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const detail = await fetch(`${baseUrl}/cosmetics/heroes/HERO_11ai/`);
  const html = await detail.text();
  assert.equal(detail.status, 200);
  assert.match(detail.headers.get('x-robots-tag') ?? '', /^index, follow/);
  assert.match(html, /<h1>Керриган-арахнид<\/h1>/);
  assert.match(html, /rel="canonical" href="https:\/\/arena\.hs-manacost\.ru\/cosmetics\/heroes\/HERO_11ai\/"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /data-route-status="200"/);
  assert.match(html, /\/assets\/app\.js/);
  assert.match(html, /https:\/\/arena\.hs-manacost\.ru\/api\/public-resource\/db\/uploads\/hero-skins\/static\/HERO_11ai\.png/);
  assert.doesNotMatch(html, /https:\/\/db\.kolodahs\.ru/);

  const missing = await fetch(`${baseUrl}/cosmetics/heroes/MISSING/`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('x-robots-tag'), 'noindex, nofollow');

  const broken = await fetch(`${baseUrl}/cosmetics/heroes/BROKEN/`);
  assert.equal(broken.status, 503);
  assert.equal(broken.headers.get('retry-after'), '300');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('cosmetics SEO route tests passed');
