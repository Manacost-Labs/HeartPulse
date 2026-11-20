import assert from 'node:assert/strict';
import { compactTierlistClass, openTierlistView } from '../apps/public-web/lib/openTierlistView.js';
import { TIERLIST_CLASS_SLUGS, tierlistClassIdFromSlug, tierlistClassPageHeading, tierlistClassPath } from '../apps/public-web/lib/tierlistClassPages.js';
import { tierlistClassSeoText } from '../apps/public-web/lib/tierlistClassSeo.js';
import { tierlistClassStructuredNodes } from '../apps/public-web/lib/tierlistClassStructuredData.js';
import { seoStructuredDataGraphOf } from '../src/seo/structuredData.js';
import { DATA_PAGES } from '../scripts/lib/post-deploy-data-pages.mjs';
import type { PublicTierlist } from '../apps/public-web/lib/publicTierlistData.js';

// The class pages of the Arena tier list (#617): every class of the open pool and the neutral cards have a page,
// the class choice links to it, and a class page carries the cards of its class only (the others stay named).

const card = (cardId: string, tier: string) => ({ cardId, name: `Карта ${cardId}`, tier, cost: 3, rarity: 'rare', type: 'minion',
  winrate: 55.5, pickRate: 40.1 });
const pool: PublicTierlist = {
  updatedAt: '2026-11-20T06:00:08.242Z', source: 'hsreplay.net', sampleGamesAtLeast: 53_000,
  classes: [
    { id: 'mage', name: 'Маг', cards: [card('M1', 'S'), card('M2', 'B')] },
    { id: 'warrior', name: 'Воин', cards: [card('W1', 'A')] },
    { id: 'any', name: 'Нейтральные', cards: [card('N1', 'C')] },
  ],
};

assert.equal(tierlistClassPath('__all__'), '/tierlist/', '«Все карты» is the tier list itself');
assert.equal(tierlistClassPath('death-knight'), '/tierlist/death-knight/');
assert.equal(tierlistClassPath('any'), '/tierlist/neutral/', 'the neutral cards have a page of their own');
for (const slug of TIERLIST_CLASS_SLUGS) {
  const id = tierlistClassIdFromSlug(slug);
  assert.ok(id, `${slug} is a class page`);
  assert.equal(tierlistClassPath(id!), `/tierlist/${slug}/`, `${slug} round-trips`);
}
for (const odd of ['any', '__all__', 'Mage', 'mage/', '', 'neutrals']) assert.equal(tierlistClassIdFromSlug(odd), null, `«${odd}» is no page`);

const mage = openTierlistView(compactTierlistClass(pool, 'mage'));
assert.deepEqual(mage.sections.map(section => section.id), ['mage', 'warrior', 'any'], 'every class is still named');
assert.deepEqual(mage.sections.map(section => section.totalCards), [2, 0, 0], 'only the page\'s class carries its cards');
assert.deepEqual(Object.keys(mage.cards).sort(), ['M1', 'M2']);
const neutral = openTierlistView(compactTierlistClass(pool, 'any'));
assert.deepEqual(neutral.sections.map(section => section.totalCards), [0, 0, 1]);

// A class page has its own H1 and breadcrumb: not a duplicate of the tier list's heading.
assert.deepEqual(tierlistClassPageHeading('mage', 'Маг'), { title: 'Тир-лист карт Арены Hearthstone: Маг', name: 'Маг', href: '/tierlist/mage/' });
assert.deepEqual(tierlistClassPageHeading('any', 'Нейтральные'), { title: 'Нейтральные карты Арены Hearthstone', name: 'Нейтральные', href: '/tierlist/neutral/' });
// Title and description of a class page: its record in the SEO registry with the data date and the sample the page
// prints; data a week old has no month, a title that would pass 60 characters drops it too, and a page without cards of
// its class keeps the record's static text.
const dated: PublicTierlist = { ...pool, updatedAt: '2026-09-20T09:00:00.000Z',
  classes: [...pool.classes, { id: 'demon-hunter', name: 'Охотник на демонов', cards: [card('D1', 'A')] }] };
const fresh = Date.parse('2026-09-21T00:00:00.000Z');
const stale = Date.parse('2026-10-21T00:00:00.000Z');
assert.deepEqual(tierlistClassSeoText(dated, 'mage', fresh), {
  title: 'Тир-лист Арены Hearthstone (хс): Маг, сентябрь 2026',
  description: 'Маг: тир-лист карт Арены Hearthstone на 20 сентября 2026. Тир, винрейт и частота выбора каждой карты, более 53 000 игр. Данные HSReplay.',
});
assert.deepEqual(tierlistClassSeoText(dated, 'demon-hunter', fresh), {
  title: 'Тир-лист Арены Hearthstone (хс): Охотник на демонов',
  description: 'Охотник на демонов: тир-лист карт Арены Hearthstone на 20 сентября 2026. Тир, винрейт и частота выбора каждой карты, более 53 000 игр. Данные HSReplay.',
}, '«…, сентябрь 2026» would make a 66-character title');
assert.deepEqual(tierlistClassSeoText(dated, 'demon-hunter', stale), {
  title: 'Тир-лист Арены Hearthstone (хс): Охотник на демонов',
  description: 'Охотник на демонов: тир-лист карт Арены Hearthstone, обновлено 20 сентября 2026. Тир, винрейт и частота выбора каждой карты, более 53 000 игр. Данные HSReplay.',
});
assert.deepEqual(tierlistClassSeoText(dated, 'any', fresh), {
  title: 'Нейтральные карты Арены Hearthstone: тир-лист, сентябрь 2026',
  description: 'Нейтральные карты Арены Hearthstone на 20 сентября 2026: тир, винрейт и частота выбора каждой карты, более 53 000 игр. Данные HSReplay.',
});
assert.deepEqual(tierlistClassSeoText(dated, 'any', stale), {
  title: 'Нейтральные карты Арены Hearthstone: тир-лист',
  description: 'Нейтральные карты Арены Hearthstone, обновлено 20 сентября 2026: тир, винрейт и частота выбора каждой карты, более 53 000 игр. Данные HSReplay.',
});
const undated = {
  title: `Тир-лист Арены Hearthstone (хс): Жрец, ${new Date().getUTCFullYear()}`,
  description: 'Жрец: тир-лист карт Арены Hearthstone (хс) — тир, винрейт и частота выбора каждой карты класса. Данные HSReplay.',
};
assert.deepEqual(tierlistClassSeoText(dated, 'priest', fresh), undated, 'a class without cards in the pool has no date');
assert.deepEqual(tierlistClassSeoText(null, 'priest', fresh), undated, 'no pool, no date');
assert.equal(tierlistClassSeoText(null, 'any', fresh).title, `Нейтральные карты Арены Hearthstone (хс): тир-лист, ${new Date().getUTCFullYear()}`);

// JSON-LD of a class page through the shared graph builder (#668: the route is indexable): the breadcrumb the page
// shows («Главная › Тир-лист › Маг»), the page, and the Dataset of its cards with the tier list's sources and paywall.
const magePage = { title: 'Тир-лист Арены Hearthstone (хс): Маг, сентябрь 2026', description: 'Маг: тир-лист карт Арены Hearthstone.' };
const graph = (await seoStructuredDataGraphOf('/tierlist/mage/', tierlistClassStructuredNodes('mage', magePage),
  { dateModified: '2026-09-20T09:00:00.000Z' }))!['@graph'];
assert.deepEqual(graph.map(node => node['@type']), ['Organization', 'BreadcrumbList', 'CollectionPage', 'Dataset']);
assert.deepEqual(graph[1], {
  '@type': 'BreadcrumbList', '@id': 'https://hearthpulse.net/tierlist/mage/#breadcrumb',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://hearthpulse.net/' },
    { '@type': 'ListItem', position: 2, name: 'Тир-лист', item: 'https://hearthpulse.net/tierlist/' },
    { '@type': 'ListItem', position: 3, name: 'Маг', item: 'https://hearthpulse.net/tierlist/mage/' },
  ],
});
assert.deepEqual(graph[2], {
  '@type': 'CollectionPage', '@id': 'https://hearthpulse.net/tierlist/mage/#webpage', url: 'https://hearthpulse.net/tierlist/mage/',
  name: 'Тир-лист Арены Hearthstone (хс): Маг, сентябрь 2026', description: 'Маг: тир-лист карт Арены Hearthstone.',
  inLanguage: 'ru', breadcrumb: { '@id': 'https://hearthpulse.net/tierlist/mage/#breadcrumb' }, dateModified: '2026-09-20T09:00:00.000Z',
});
const dataset = graph[3];
assert.deepEqual([dataset['@id'], dataset.name, dataset.url, dataset.isAccessibleForFree, dataset.hasPart, dataset.dateModified,
  dataset.publisher], ['https://hearthpulse.net/tierlist/mage/#dataset', 'Тир-лист карт Арены Hearthstone: Маг',
  'https://hearthpulse.net/tierlist/mage/', false, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-tierlist' },
  '2026-09-20T09:00:00.000Z', { '@id': 'https://hearthpulse.net/#org' }]);
assert.deepEqual((dataset.isBasedOn as Array<Record<string, unknown>>).map(source => source.name),
  ['HearthArena: Tierlist', 'HSReplay: Arena cards', 'Firestone']);
assert.equal(dataset.description, 'Тир-лист карт Арены Hearthstone: Маг с оценками от S до F по данным HSReplay, HearthArena и Firestone. '
  + 'На открытой странице — все карты класса с тиром, винрейтом и частотой выбора, дата обновления и нижняя граница числа игр. '
  + 'Остальные показатели карт, узкие фильтры и история доступны по подписке.');
const neutralGraph = (await seoStructuredDataGraphOf('/tierlist/neutral/', tierlistClassStructuredNodes('any', magePage)))!['@graph'];
assert.deepEqual((neutralGraph[1].itemListElement as Array<Record<string, unknown>>)[2],
  { '@type': 'ListItem', position: 3, name: 'Нейтральные', item: 'https://hearthpulse.net/tierlist/neutral/' });
assert.equal(neutralGraph[3].name, 'Тир-лист нейтральных карт Арены Hearthstone');

// The deploy warm-up renders every class page once Express answers (no build copy to revalidate, so no `isr`).
assert.deepEqual(DATA_PAGES.filter(page => page.path.startsWith('/tierlist/') && page.path !== '/tierlist/'), [
  '/tierlist/death-knight/', '/tierlist/demon-hunter/', '/tierlist/druid/', '/tierlist/hunter/', '/tierlist/mage/', '/tierlist/paladin/',
  '/tierlist/priest/', '/tierlist/rogue/', '/tierlist/shaman/', '/tierlist/warlock/', '/tierlist/warrior/', '/tierlist/neutral/',
].map(path => ({ path, marker: 'hs-tier-card', copyWords: 0, dataWords: 0 })));
