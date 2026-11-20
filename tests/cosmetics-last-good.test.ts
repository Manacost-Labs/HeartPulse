import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCosmeticsDataService } from '../server/cosmeticsRoutes.js';
import { withCosmeticsLastGood } from '../server/modules/cosmetics/public.js';

// After every restart the cosmetics catalog was read from the data API again;
// under the load of a fresh start that took over 3 s, the public page waited
// 2 s and answered 503 (#630). A restarted server now answers from the copy
// it saved and refreshes behind it.

const API = 'https://api.kolodahearthstone.com/api/v1';
const NAMES = 'https://api.hearthstonejson.com/v1/latest/ruRU/cards.json';
const heroPage = {
  data: [{
    card_id: 'HERO_11ai', dbf: 120228, name: { en: 'Arachnid Kerrigan' },
    class: { slug: 'deathknight', name_ru: 'Рыцарь смерти' }, rarity: { slug: 'mythic', name_ru: 'Мифический' },
    categories: [{ slug: 'mythic_skins', name_ru: 'Мифические скины' }],
    images: { static: '/uploads/hero-skins/static/HERO_11ai.png' }, updated_at: '2026-07-26 18:05:44',
  }],
  pagination: { page: 1, per_page: 100, total: 1, total_pages: 1 },
};
const names = [{ id: 'HERO_11ai', name: 'Керриган-арахнид' }];
const query = { page: 1, perPage: 24, q: '' };
const never = () => new Promise<never>(() => undefined);

const directory = mkdtempSync(join(tmpdir(), 'cosmetics-last-good-'));
const service = (fetchJson: (url: string) => Promise<unknown>) => createCosmeticsDataService({
  apiBaseUrl: API,
  localizedCardsUrl: NAMES,
  fetchJson: withCosmeticsLastGood(fetchJson, { stateDirectory: directory, apiBaseUrl: API, localizedCardsUrl: NAMES, answerWithinMs: 300 }),
});
const heroNames = (catalog: Record<string, unknown>) => (catalog.items as Array<{ name: { ru: string } }>).map(item => item.name.ru);

try {
  // A working source: the answer is the source's, and it is kept.
  const fresh = await service(async url => (url === NAMES ? names : heroPage)).loadCatalog('heroes', query);
  assert.deepEqual(heroNames(fresh), ['Керриган-арахнид']);
  await new Promise(resolve => setTimeout(resolve, 50));

  // A restarted server whose source does not answer: the saved copy, fast.
  const startedAt = Date.now();
  const cold = await service(never).loadCatalog('heroes', query);
  assert.deepEqual(heroNames(cold), ['Керриган-арахнид']);
  assert.ok(Date.now() - startedAt < 1_500, `answered in ${Date.now() - startedAt} ms`);

  // A source that fails: the saved copy too.
  const failing = await service(async () => { throw new Error('HTTP 500'); }).loadCatalog('heroes', query);
  assert.deepEqual(heroNames(failing), ['Керриган-арахнид']);

  // A search, a far page and an empty list are not kept: the copies stay bounded.
  const coins = { data: [{ card_id: 'COIN_1', name: { en: 'Coin' }, updated_at: '2026-07-26 18:05:44' }], pagination: { total_pages: 60 } };
  await service(async () => coins).loadCatalog('coins', { ...query, q: 'золото' });
  await service(async () => coins).loadCatalog('coins', { ...query, page: 51 });
  await service(async () => ({ data: [], pagination: { total_pages: 1 } })).loadCatalog('pets', query);
  const kept = readdirSync(join(directory, 'cosmetics-last-good-v1')).filter(name => name.endsWith('.json'));
  assert.equal(kept.length, 2, 'the hero list page and the card names only');

  // A damaged copy is not served: without the source the read still fails as before.
  for (const name of kept) writeFileSync(join(directory, 'cosmetics-last-good-v1', name), '{"format":1,');
  await assert.rejects(service(async () => { throw new Error('HTTP 500'); }).loadCatalog('heroes', query));
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('cosmetics last good tests passed');
