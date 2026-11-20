import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import { startNextServer } from '../scripts/lib/next-server.mjs';

// React escapes text and attribute values in server HTML.
function decoded(value) {
  return value.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

const ORGANIZATION = {
  '@type': 'Organization', '@id': 'https://hearthpulse.net/#org', name: 'HearthPulse', url: 'https://hearthpulse.net/',
  logo: { '@type': 'ImageObject', url: 'https://hearthpulse.net/assets/arena_icon.webp' },
  sameAs: ['https://t.me/manacost_ru', 'https://boosty.to/kolodahearthstone'],
  parentOrganization: { '@type': 'Organization', name: 'Manacost', sameAs: ['https://t.me/manacost_ru', 'https://boosty.to/kolodahearthstone'] },
};

// ── One organization, cosmetics graph, lists (E21 S8) ──

const COSMETIC_HERO = { cardId: 'HERO_QA_001', dbf: 123, name: { ru: 'Контрольный герой', en: 'Fixture Hero' },
  class: { slug: 'mage', nameRu: 'Маг' }, rarity: { slug: 'base', nameRu: 'Базовый' },
  categorySlugs: [], images: { static: '/arena-logo-icon.webp', animated: null } };
const COSMETIC_COIN = { cardId: 'COIN_QA_001', dbf: 456, name: { ru: 'Контрольная монета', en: 'Fixture Coin' },
  textRu: null, images: { card: '/arena-logo-icon.webp', crop: '/arena-logo-icon.webp' } };
const COSMETIC_PET = { cardId: 'PET_QA_001', dbf: 789, variantId: 1, name: 'Контрольный питомец', level: 1,
  images: { card: '/arena-logo-icon.webp' } };
const COSMETIC_PAGINATION = { page: 1, perPage: 48, total: 1, totalPages: 1 };

function cosmeticsFixture() {
  return http.createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://fixture');
    const payloads = {
      '/api/auth/me': { user: null },
      '/api/cosmetics/heroes': { items: [COSMETIC_HERO], pagination: COSMETIC_PAGINATION, updatedAt: null, source: 'fixture' },
      '/api/cosmetics/coins': { items: [COSMETIC_COIN], generatedBy: [], related: [], pagination: COSMETIC_PAGINATION, updatedAt: null, source: 'fixture' },
      '/api/cosmetics/pets': { items: [{ petId: 1, name: 'Семейство', variants: [COSMETIC_PET] }], pagination: COSMETIC_PAGINATION, updatedAt: null, source: 'fixture' },
      '/api/cosmetics/heroes/HERO_QA_001': { ...COSMETIC_HERO, health: null, character: null, actor: null, artist: 'Cole Eastburn',
        categories: [], images: { ...COSMETIC_HERO.images, fullArt: null }, gallery: [], sounds: [], sourceUrl: null },
      '/api/cosmetics/coins/COIN_QA_001': { ...COSMETIC_COIN, text: { ru: null, en: null },
        images: { ...COSMETIC_COIN.images, golden: null, wiki: null }, generatedBy: [], related: [] },
      '/api/cosmetics/pets/PET_QA_001': { ...COSMETIC_PET, pet: { id: 1, name: 'Семейство' },
        images: { ...COSMETIC_PET.images, endScreen: null }, gallery: [], variants: [COSMETIC_PET] },
    };
    const payload = payloads[pathname] ?? null;
    response.setHeader('Content-Type', 'application/json');
    response.writeHead(payload ? 200 : 503).end(JSON.stringify(payload ?? { error: 'fixture has no data' }));
  });
}

/** Every JSON-LD document of a page, in order. */
const jsonLdDocuments = html => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)]
  .map(match => JSON.parse(match[1]));

/** Every object of a document, at any depth. */
function* everyObject(value) {
  if (Array.isArray(value)) { for (const item of value) yield* everyObject(item); return; }
  if (!value || typeof value !== 'object') return;
  yield value;
  for (const child of Object.values(value)) yield* everyObject(child);
}

/** The same checks for every page: one full organization node, every `@id` reference defined in the page, no price, no application. */
function assertSelfContainedPage(html, label) {
  const objects = jsonLdDocuments(html).flatMap(document => [...everyObject(document)]);
  const organizations = objects.filter(node => node['@type'] === 'Organization' && node['@id'] === ORGANIZATION['@id']);
  assert.deepEqual(organizations, [ORGANIZATION], `${label} prints the one organization node`);
  const defined = new Set(objects.filter(node => typeof node['@id'] === 'string' && Object.keys(node).length > 1).map(node => node['@id']));
  for (const reference of objects.filter(node => typeof node['@id'] === 'string' && Object.keys(node).length === 1)) {
    assert.ok(defined.has(reference['@id']), `${label}: ${reference['@id']} is referenced and defined nowhere in the page`);
  }
  for (const node of objects) {
    assert.ok(!['Offer', 'WebApplication', 'Person'].includes(node['@type']), `${label} has no ${node['@type']}`);
    if (node['@type'] === 'Dataset') assert.ok(!('license' in node) && !('creator' in node), `${label} Dataset has no licence or creator`);
  }
  assert.ok(!JSON.stringify(objects).includes('Manacost Arena'), `${label} keeps no old application name`);
  return objects;
}

test('cosmetic pages are graphs with the full trail, their lists name the cards the page prints, and every template shares the organization', { timeout: 240_000 }, async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before browser QA');
  const fixture = cosmeticsFixture();
  fixture.listen(0, '127.0.0.1');
  await once(fixture, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${fixture.address().port}` });
  const get = async path => {
    const response = await fetch(`${next.origin}${path}`);
    assert.equal(response.status, 200, path);
    return response.text();
  };
  try {
    // A detail page: page, item, the trail «Главная → Косметика → раздел → предмет», organization.
    for (const [kind, id, name, section] of [
      ['heroes', 'HERO_QA_001', 'Контрольный герой', 'Скины героев'],
      ['coins', 'COIN_QA_001', 'Fixture Coin', 'Косметические монеты'],
      ['pets', 'PET_QA_001', 'Контрольный питомец', 'Питомцы'],
    ]) {
      const path = `/cosmetics/${kind}/${id}/`;
      const canonical = `https://hearthpulse.net${path}`;
      const html = await get(path);
      assertSelfContainedPage(html, path);
      const [document, ...others] = jsonLdDocuments(html);
      assert.deepEqual(others, [], `${path} prints one document`);
      const graph = document['@graph'];
      assert.deepEqual(graph.map(node => node['@type']), ['WebPage', 'CreativeWork', 'BreadcrumbList', 'Organization'], path);
      const [page, work, trail] = graph;
      assert.equal(page.url, canonical);
      assert.equal(work.name, name, `${path} names the item as the page does`);
      assert.deepEqual(page.mainEntity, { '@id': work['@id'] });
      assert.deepEqual(trail.itemListElement.map(step => step.position), [1, 2, 3, 4]);
      assert.deepEqual(trail.itemListElement.map(step => step.name), ['Главная', 'Косметика', section, name], path);
      assert.deepEqual(trail.itemListElement.map(step => step.item),
        ['https://hearthpulse.net/', 'https://hearthpulse.net/cosmetics/', `https://hearthpulse.net/cosmetics/${kind}/`, canonical], path);
      assert.equal(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1], trail.itemListElement.at(-1).item,
        `${path} the last step is the canonical address`);
      assert.equal(work.description, decoded(html.match(/<meta name="description" content="([^"]*)"/)[1]), `${path} describes the item as the page does`);
      assert.ok(!JSON.stringify(graph).includes('Cole Eastburn'), 'the artist of a card is no creator of the page');
    }

    // A listing: the list is the grid of the HTML, in order; a filtered copy lists nothing.
    for (const [path, kind, shown] of [
      ['/cosmetics/', 'heroes', ['Контрольный герой']], ['/cosmetics/heroes/', 'heroes', ['Контрольный герой']],
      ['/cosmetics/coins/', 'coins', ['Fixture Coin']], ['/cosmetics/pets/', 'pets', ['Контрольный питомец']],
    ]) {
      const html = await get(path);
      assertSelfContainedPage(html, path);
      const cards = [...html.matchAll(/<a href="([^"]+)" class="cosmetics-card [^"]*">.*?<strong class="cosmetics-card-name">([^<]*)<\/strong><\/a>/gs)]
        .map(match => ({ name: decoded(match[2]), url: new URL(match[1], 'https://hearthpulse.net').href }));
      assert.deepEqual(cards.map(card => card.name), shown, `${path} prints these cards`);
      const list = jsonLdDocuments(html).flatMap(document => document['@graph']).find(node => node['@type'] === 'ItemList');
      assert.ok(list, `${path} has a list`);
      assert.deepEqual(list.itemListElement, cards.map((card, index) => ({ '@type': 'ListItem', position: index + 1, ...card })), `${path} list equals the grid`);
      assert.equal(list.numberOfItems, cards.length);
      assert.ok(cards.every(card => card.url.startsWith(`https://hearthpulse.net/cosmetics/${kind}/`)));
      const collection = jsonLdDocuments(html).flatMap(document => document['@graph']).find(node => node['@type'] === 'CollectionPage');
      assert.deepEqual(collection.mainEntity, { '@id': list['@id'] }, `${path} the collection is the list`);
    }
    const filtered = await get('/cosmetics/heroes/?class=mage');
    assert.equal(jsonLdDocuments(filtered).flatMap(document => document['@graph'] ?? []).some(node => node['@type'] === 'ItemList'), false,
      'a filtered copy is not the canonical listing');

    // Pages that print their list in the browser, or print no page of their own for an entry, get no list.
    for (const path of ['/guides-archive/', '/battlegrounds/tier-list/', '/standard/patches/', '/standard/fun-decks/', '/gallery/', '/contests/']) {
      const response = await fetch(`${next.origin}${path}`);
      if (response.status !== 200) continue;
      const html = await response.text();
      assert.equal(jsonLdDocuments(html).flatMap(document => document['@graph'] ?? []).some(node => node['@type'] === 'ItemList'), false, `${path} lists nothing it does not print`);
      if (jsonLdDocuments(html).length) assertSelfContainedPage(html, path);
    }

    // The templates of the registry: the same organization everywhere, and no application or price.
    // The tier builder left the index with no open layer (#553) and prints no JSON-LD.
    assert.deepEqual(jsonLdDocuments(await get('/battlegrounds/tier-builder/')), [], 'the noindex builder prints no JSON-LD');
    for (const path of ['/', '/battlegrounds/strategies/', '/faq/', '/terms/']) {
      const html = await get(path);
      const objects = assertSelfContainedPage(html, path);
      if (path === '/') {
        assert.deepEqual(objects.find(node => node['@type'] === 'WebSite').publisher, { '@id': ORGANIZATION['@id'] }, 'the site points at the organization');
      }
      if (path.startsWith('/battlegrounds/')) {
        // The strategies page lists its open builds, so it is a collection.
        const page = objects.find(node => node['@type'] === 'CollectionPage');
        assert.equal(page.url, `https://hearthpulse.net${path}`);
        assert.ok(page.name && page.description, `${path} names and describes itself`);
      }
    }

    // The deck builder keeps noindex and names itself canonical.
    const builder = await get('/standard/deck-builder/');
    assert.equal(builder.match(/<link rel="canonical" href="([^"]+)"/)?.[1], 'https://hearthpulse.net/standard/deck-builder/');
    assert.match(builder.match(/<meta name="robots" content="([^"]+)"/)?.[1] ?? '', /noindex, nofollow/);
    assert.deepEqual(jsonLdDocuments(builder), [], 'a page that is not indexable prints no graph');
  } finally {
    await next.close();
    fixture.closeAllConnections();
    await new Promise(resolve => fixture.close(resolve));
  }
});
