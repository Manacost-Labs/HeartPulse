import assert from 'node:assert/strict';
import routeInventory from '../config/public-route-inventory.json';
import { TABS } from '../src/routes';
import {
  publicSeoPages,
  renderSeoTemplate,
  seoPageForExactPath,
  seoPageForNavigationRoute,
} from '../src/seo/registry';
import { resolvePublicUrlPolicy } from '../src/seo/publicUrlPolicy';

const pages = publicSeoPages();
const policyRouteIds = new Set(routeInventory.routes.map(route => route.id));
const navigationPages = pages.filter(page => page.navigationRouteId);
const sitemapPages = pages.filter(page => page.sitemap);

assert.equal(new Set(pages.map(page => page.pathname)).size, pages.length, 'SEO paths must be unique');
assert.equal(
  new Set(navigationPages.map(page => page.navigationRouteId)).size,
  navigationPages.length,
  'navigation route IDs must be unique',
);
assert.equal(navigationPages.length, TABS.length, 'every navigation route needs one default SEO page');

for (const route of TABS) {
  const page = seoPageForNavigationRoute(route.id);
  assert.equal(page.pathname, route.slug, `${route.id} must use its route root as default metadata`);
}

const indexedTitles = new Set<string>();
const indexedDescriptions = new Set<string>();
for (const page of pages) {
  assert.equal(seoPageForExactPath(`${page.pathname}/?preview=1`), page, `${page.pathname} exact lookup`);
  assert.equal(policyRouteIds.has(page.policyRouteId), true, `${page.pathname} policy route must exist`);
  assert.doesNotMatch(page.title, /\{[a-z]+\}/, `${page.pathname} title must resolve templates`);
  assert.doesNotMatch(page.description, /\{[a-z]+\}/, `${page.pathname} description must resolve templates`);

  const policy = await resolvePublicUrlPolicy(page.pathname);
  assert.equal(policy.routeId, page.policyRouteId, `${page.pathname} must resolve to its declared policy`);
  if (page.sitemap) {
    assert.equal(policy.indexPolicy, 'index', `${page.pathname} sitemap page must be indexable`);
    assert.equal(
      policy.canonicalUrl,
      `${routeInventory.canonicalOrigin}${page.pathname === '/' ? '/' : `${page.pathname}/`}`,
      `${page.pathname} sitemap page must have a self canonical`,
    );
    assert.equal(indexedTitles.has(page.title), false, `${page.pathname} must have a unique title`);
    assert.equal(indexedDescriptions.has(page.description), false, `${page.pathname} must have a unique description`);
    indexedTitles.add(page.title);
    indexedDescriptions.add(page.description);
  } else {
    assert.notEqual(policy.indexPolicy, 'index', `${page.pathname} excluded page must be noindex`);
    assert.equal(policy.canonicalUrl, null, `${page.pathname} excluded page must not have a canonical`);
  }
}

for (const pathname of [
  '/standard/matchups',
  '/gallery',
  '/library/archive/minions',
  '/library/archive/spells',
]) {
  assert.equal(
    sitemapPages.some(page => page.pathname === pathname),
    true,
    `${pathname} must not disappear from sitemap generation`,
  );
}

assert.equal(seoPageForExactPath('/not-materialized'), null);
assert.throws(() => seoPageForNavigationRoute('not-a-route'), /Missing SEO metadata/);
assert.equal(renderSeoTemplate('Сезон {year}', 2030), 'Сезон 2030');
assert.throws(() => renderSeoTemplate('{month}', 2030), /Unsupported SEO template token/);

console.log(`SEO registry assertions passed (${pages.length} pages, ${sitemapPages.length} sitemap URLs)`);
