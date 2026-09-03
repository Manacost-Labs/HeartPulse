import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const intentContracts = [
  {
    pathname: '/tierlist',
    title: /Тир-лист Арены Hearthstone/,
    description: /тир-лист карт Арены/i,
  },
  {
    pathname: '/battlegrounds/tier-list',
    title: /Тир-лист БГ Hearthstone/,
    description: /стратег/i,
  },
  {
    pathname: '/battlegrounds/strategies',
    title: /Конструктор стратегий БГ Hearthstone/,
    description: /собир/i,
  },
  {
    pathname: '/standard/meta',
    title: /HSGuru.*мета Hearthstone/i,
    description: /по данным HSGuru/i,
  },
];

for (const contract of intentContracts) {
  const page = seoPageForExactPath(contract.pathname);
  assert.ok(page, `${contract.pathname} must have SEO metadata`);
  assert.match(page.title, contract.title, `${contract.pathname} title must own its search intent`);
  assert.match(page.description, contract.description, `${contract.pathname} description must explain its intent`);
}

const deferredRoutesSource = readFileSync(new URL('../src/features/DeferredRoutes.tsx', import.meta.url), 'utf8');
assert.match(deferredRoutesSource, /SectionBanner title="Тир-лист карт Арены Hearthstone"/);
assert.match(deferredRoutesSource, /<ArenaTierListSearchIntro \/>/);

const battlegroundsSource = readFileSync(new URL('../src/features/Battlegrounds.tsx', import.meta.url), 'utf8');
assert.match(battlegroundsSource, /<BattlegroundsTierListSearchIntro \/>/);
assert.match(battlegroundsSource, /<BattlegroundsStrategyBuilderSearchIntro \/>/);

const arenaLandingSource = readFileSync(new URL('../src/modules/searchLanding/ui/ArenaTierListSearchIntro.tsx', import.meta.url), 'utf8');
assert.match(arenaLandingSource, /href="\/classes"[^>]*>Винрейты классов Арены<\/a>/);

const battlegroundsLandingSource = readFileSync(new URL('../src/modules/searchLanding/ui/BattlegroundsSearchIntros.tsx', import.meta.url), 'utf8');
assert.match(battlegroundsLandingSource, /<h1[^>]*>Тир-лист БГ Hearthstone<\/h1>/);
assert.match(battlegroundsLandingSource, /<h1[^>]*>Конструктор стратегий БГ Hearthstone<\/h1>/);
assert.match(battlegroundsLandingSource, /href="\/battlegrounds\/tier-list"[^>]*>Тир-лист стратегий БГ<\/a>/);

const standardMetaSource = readFileSync(new URL('../src/features/StandardMeta.tsx', import.meta.url), 'utf8');
assert.match(standardMetaSource, /<StandardMetaSearchIntro \/>/);
assert.match(standardMetaSource, /<StandardMetaRelatedLinks \/>/);
const standardMetaLandingSource = readFileSync(new URL('../src/modules/searchLanding/ui/StandardMetaSearchIntro.tsx', import.meta.url), 'utf8');
assert.match(standardMetaLandingSource, /<h1>HSGuru: мета Hearthstone<\/h1>/);
assert.match(standardMetaLandingSource, /HSGuru — источник статистики/);

console.log(`SEO registry assertions passed (${pages.length} pages, ${sitemapPages.length} sitemap URLs)`);
