import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import routeInventory from '../src/shared/seo/publicRouteInventory.json';
import { TABS } from '../src/app/routing/navigationRoutes';
import {
  publicSeoPages,
  renderSeoTemplate,
  seoPageText,
  seoPageForExactPath,
  seoPageForNavigationRoute,
} from '../src/seo/registry';
import { resolvePublicUrlPolicy } from '../src/shared/seo/publicUrlPolicy';
import { subscriptionPaywallHeading } from '../src/components/subscriptionPaywallHeading';
import { assertSeoDataTemplate, renderSeoDataTemplate } from '../src/seo/dataTemplate';
import { standardMetaPeriodLabel } from '../src/features/standardMetaFilterModel';
import { seoDataDate } from '../apps/public-web/lib/seoDataDate';
import {
  archetypeCatalogSeoValues, archetypeDetailSeoText, standardMetaSeoValues,
} from '../apps/public-web/lib/seoDataValues';
import { publicArchetypeCatalog } from '../apps/public-web/lib/publicArchetypeCatalogTeaserData';
import { publicArchetypeTeaser } from '../apps/public-web/lib/publicArchetypeTeaserData';

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
  assert.equal(page.pathname, route.path, `${route.id} must use its route root as default metadata`);
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
    title: /Конструктор стратегий БГ/,
    description: /собир/i,
  },
  {
    pathname: '/standard/meta',
    title: /^Мета Hearthstone \d{4}: тир-лист колод \| HearthPulse$/,
    description: /Данные HSGuru\.$/,
  },
  {
    pathname: '/standard/archetypes',
    title: /^Архетипы Hearthstone: винрейт, \d{4} \| HearthPulse$/,
    description: /Данные HSGuru\.$/,
  },
];

for (const contract of intentContracts) {
  const page = seoPageForExactPath(contract.pathname);
  assert.ok(page, `${contract.pathname} must have SEO metadata`);
  assert.match(page.title, contract.title, `${contract.pathname} title must own its search intent`);
  assert.match(page.description, contract.description, `${contract.pathname} description must explain its intent`);
}

const deferredRoutesSource = readFileSync(new URL('../src/features/DeferredRoutes.tsx', import.meta.url), 'utf8');
assert.match(deferredRoutesSource, /SectionBanner title="Тир-лист карт"/);
assert.doesNotMatch(deferredRoutesSource, /<ArenaTierListSearchIntro \/>/);

const battlegroundsSource = readFileSync(new URL('../src/features/Battlegrounds.tsx', import.meta.url), 'utf8');
assert.match(battlegroundsSource, /<BattlegroundsTierListSearchIntro \/>/);
assert.match(battlegroundsSource, /<BattlegroundsStrategyBuilderSearchIntro \/>/);
assert.match(battlegroundsSource, /герой Полей сражений \| HearthPulse/);
assert.doesNotMatch(battlegroundsSource, /герой Полей сражений \| Manacost Stats/);

const constructedCardsSource = readFileSync(new URL('../src/features/StandardCardDetail.tsx', import.meta.url), 'utf8');
assert.match(constructedCardsSource, /карта Hearthstone.*\| HearthPulse/);
assert.doesNotMatch(constructedCardsSource, /карта Hearthstone.*\| Manacost Stats/);

// One brand in every public title: the canonical domain is hearthpulse.net.
const seoPagesSource = readFileSync('config/public-seo-pages.json', 'utf8');
assert.doesNotMatch(seoPagesSource, /\| Manacost Stats"/, 'public page titles end with | HearthPulse');

const battlegroundsLibrarySource = readFileSync(new URL('../src/features/BgLibrary.tsx', import.meta.url), 'utf8');
assert.match(battlegroundsLibrarySource, /библиотека BG Hearthstone \| HearthPulse/);
assert.match(battlegroundsLibrarySource, /shortTitle} BG Hearthstone \| HearthPulse/);
assert.doesNotMatch(battlegroundsLibrarySource, /BG Hearthstone \| HS-Manacost/);

const paywallGateSource = readFileSync(new URL('../src/components/PaywallGate.tsx', import.meta.url), 'utf8');
assert.match(paywallGateSource, /headingLevel: Heading = 'h1'/);
assert.match(paywallGateSource, /<Heading[^>]*id="paywall-gate-title"/);
assert.match(paywallGateSource, /subscriptionPaywallHeading\(title\)/);
assert.doesNotMatch(paywallGateSource, /<h1 style=\{\{ margin: 0/);
assert.equal(subscriptionPaywallHeading('Тир-лист доступны подписчикам', '/tierlist/'), 'Тир-лист карт');
assert.equal(subscriptionPaywallHeading('Тир-лист доступны подписчикам', '/battlegrounds/tier-list/'), 'Тир-лист БГ');
assert.equal(
  subscriptionPaywallHeading(
    'Библиотека доступны подписчикам',
    '/library/minions/electric-synthesizer-100026/',
    'Электрический синтезатор — существо Полей сражений Hearthstone | HearthPulse',
  ),
  'Электрический синтезатор',
);
assert.equal(
  subscriptionPaywallHeading(
    'Герои доступны подписчикам',
    '/heroes/61914/',
    'Королева Азшара — герой Полей сражений | HearthPulse',
  ),
  'Королева Азшара',
);
assert.equal(subscriptionPaywallHeading('Мета доступна подписчикам', '/standard/meta/'), 'Мета доступна подписчикам');


const battlegroundsLandingSource = readFileSync(new URL('../src/modules/searchLanding/ui/BattlegroundsSearchIntros.tsx', import.meta.url), 'utf8');
assert.match(battlegroundsLandingSource, /<SectionBanner title="Тир-лист БГ"/);
assert.match(battlegroundsLandingSource, /<SectionBanner title="Конструктор стратегий БГ"/);
assert.doesNotMatch(battlegroundsLandingSource, /<nav/);

const standardMetaSource = readFileSync(new URL('../src/features/StandardMeta.tsx', import.meta.url), 'utf8');
assert.match(standardMetaSource, /<StandardMetaSearchIntro \/>/);
assert.doesNotMatch(standardMetaSource, /StandardMetaRelatedLinks/);
const standardMetaLandingSource = readFileSync(new URL('../src/modules/searchLanding/ui/StandardMetaSearchIntro.tsx', import.meta.url), 'utf8');
assert.match(standardMetaLandingSource, /<h1>Мета<\/h1>/);


// ── Data templates (E9 S1): titles and descriptions that carry the date of the data ──
{
  // Template language: required tokens, optional groups, the length limit.
  assert.equal(renderSeoDataTemplate('Мета {month}', { month: 'октябрь 2026' }, 65), 'Мета октябрь 2026');
  assert.equal(renderSeoDataTemplate('Мета {month}', { month: null }, 65), null, 'a required token without a value cannot be rendered');
  assert.equal(renderSeoDataTemplate('Мета{asOf}.', {}, 65), null);
  assert.equal(renderSeoDataTemplate('Мета[, {month}][ | HearthPulse]', { month: null }, 65), 'Мета | HearthPulse',
    'an optional group without a value is dropped');
  assert.equal(renderSeoDataTemplate('Мета[, {month}][ | HearthPulse]', { month: 'октябрь 2026' }, 65),
    'Мета, октябрь 2026 | HearthPulse');
  assert.equal(renderSeoDataTemplate('Мета[, {month}][ | HearthPulse]', { month: 'октябрь 2026' }, 24), 'Мета, октябрь 2026',
    'a text that does not fit loses its last group first');
  assert.equal(renderSeoDataTemplate('Мета[, {month}][ | HearthPulse]', { month: 'октябрь 2026' }, 4), 'Мета');
  assert.equal(renderSeoDataTemplate('Мета[, {month}]', { month: 'октябрь 2026' }, 3), null,
    'the required part alone does not fit');
  assert.equal(renderSeoDataTemplate('Игр: {games}', { games: '31 959  игра' }, 65), 'Игр: 31 959 игра',
    'whitespace of a value collapses');
  assert.throws(() => assertSeoDataTemplate('Мета {year}', ['month'], 'x'), /Unsupported SEO data token/);
  assert.throws(() => assertSeoDataTemplate('Мета [{month}', ['month'], 'x'), /Invalid optional group/);
  assert.throws(() => assertSeoDataTemplate('Мета [[{month}]]', ['month'], 'x'), /Invalid optional group/);
  assert.throws(() => assertSeoDataTemplate('Мета {month}]', ['month'], 'x'), /Invalid optional group/);

  // The date of the data: Moscow time, never the server's clock.
  const NOW = Date.parse('2026-10-29T10:00:00Z');
  assert.deepEqual(seoDataDate('2026-10-28T23:00:00.000Z', NOW), {
    iso: '2026-10-28T23:00:00.000Z', month: 'октябрь 2026', date: '29 октября 2026', time: '02:00', stale: false,
  });
  assert.deepEqual(seoDataDate('2026-10-31T21:30:00Z', Date.parse('2026-11-01T09:00:00Z')), {
    iso: '2026-10-31T21:30:00.000Z', month: 'ноябрь 2026', date: '1 ноября 2026', time: '00:30', stale: false,
  }, 'the evening of 31 October UTC is already 1 November in Moscow');
  assert.equal(seoDataDate('2026-12-31T21:00:00Z', Date.parse('2027-01-01T09:00:00Z'))?.month, 'январь 2027');
  assert.equal(seoDataDate('2026-10-22T10:00:00Z', NOW)?.stale, false, 'exactly seven days old is still fresh');
  assert.equal(seoDataDate('2026-10-22T09:59:59Z', NOW)?.stale, true, 'older than seven days is stale');
  assert.equal(seoDataDate('2026-10-30T09:00:00Z', NOW)?.stale, false, 'a source clock a few hours ahead is tolerated');
  assert.equal(seoDataDate('2026-10-31T10:00:00Z', NOW), null, 'a date more than a day ahead is not trusted');
  assert.equal(seoDataDate('not a date', NOW), null);
  assert.equal(seoDataDate(null, NOW), null);

  const META = '/standard/meta';
  const CATALOG = '/standard/archetypes';
  const staticPage = (path: string) => seoPageForExactPath(path)!;
  const metaRow = (archetypeLabel: string, winrate: number | null, games: number | null) => ({
    id: archetypeLabel, slug: archetypeLabel, archetype: archetypeLabel, archetypeLabel, translated: true, classKey: null,
    winrate, popularity: 5, games, turns: 8, durationMinutes: 7, climbingSpeed: 1,
  });
  const metaSeed = (updatedAt: string | null, items: ReturnType<typeof metaRow>[]) => ({
    period: 'patch_36.6.3' as const,
    data: {
      format: 'standard' as const, formatLabel: 'Стандарт', rank: 'diamond_legend' as const, rankLabel: 'Алмаз — Легенда',
      period: 'patch_36.6.3' as const, availablePeriods: ['patch_36.6.3' as const], currentPeriod: 'patch_36.6.3' as const,
      currentPatchPeriod: 'patch_36.6.3' as const, coin: 'any_player' as const, minGames: 100 as const, source: 'hsguru',
      sourceUrl: 'https://www.hsguru.com/meta', translationSource: '', updatedAt, items,
    },
  });
  const metaText = async (seed: ReturnType<typeof metaSeed> | null, now = NOW) =>
    seoPageText(staticPage(META), standardMetaSeoValues(seed, now));
  const FRESH = '2026-10-28T23:00:00.000Z';
  const TOP_ROWS = [metaRow('Зоолок', 61, 14800), metaRow('Граб\'Зи К\'тун Шаман', 58.2, 5400), metaRow('Н\'зот Чернокнижник', 57.4, 258)];

  // Meta: month in the title, full date, leader and source in the description.
  assert.deepEqual(await metaText(metaSeed(FRESH, TOP_ROWS)), {
    title: 'Мета Hearthstone октябрь 2026: тир-лист колод | HearthPulse',
    description: 'Мета Хартстоуна (хс) на 29 октября 2026: тир-лист колод Стандарта. Лидер — Зоолок, 61% побед. Винрейт и популярность архетипов. Данные HSGuru.',
  });
  // Only a row with at least 1000 games is a leader; a noisy first row does not shadow it.
  assert.equal((await metaText(metaSeed(FRESH, [metaRow('Шум', 70, 999), TOP_ROWS[1], TOP_ROWS[2]]))).description,
    'Мета Хартстоуна (хс) на 29 октября 2026: тир-лист колод Стандарта. Лидер — Граб\'Зи К\'тун Шаман, 58,2% побед. Винрейт и популярность архетипов. Данные HSGuru.');
  assert.equal((await metaText(metaSeed(FRESH, [metaRow('Шум', 70, 999), metaRow('Пусто', null, null)]))).description,
    'Мета Хартстоуна (хс) на 29 октября 2026: тир-лист колод Стандарта. Винрейт и популярность архетипов. Данные HSGuru.',
    'without a row of 1000 games there is no leader');
  // A long archetype name costs the closing sentence, never the date or the source.
  const longLeader = 'Колода-завоеватель с очень длинным названием архетипа';
  assert.equal((await metaText(metaSeed(FRESH, [metaRow(longLeader, 61, 14800)]))).description,
    `Мета Хартстоуна (хс) на 29 октября 2026: тир-лист колод Стандарта. Лидер — ${longLeader}, 61% побед. Данные HSGuru.`);
  // Older than a week: no month in the title, «обновлено» in the description.
  const stale = await metaText(metaSeed('2026-10-20T10:00:00.000Z', TOP_ROWS));
  assert.equal(stale.title, staticPage(META).title, 'stale data leaves the month out of the title');
  assert.equal(stale.description,
    'Мета Хартстоуна (хс), обновлено 20 октября 2026: тир-лист колод Стандарта. Лидер — Зоолок, 61% побед. Винрейт и популярность архетипов. Данные HSGuru.');
  // Without a teaser or a date: the registry's static text, no date and no numbers.
  for (const seed of [null, metaSeed(null, TOP_ROWS), metaSeed('сломано', TOP_ROWS)]) {
    assert.deepEqual(await metaText(seed), { title: staticPage(META).title, description: staticPage(META).description });
  }
  // Limits in every month, with the longest leader: title 65, description 160, one «(хс)», the source and the date stay.
  for (let month = 1; month <= 12; month += 1) {
    const stamp = `2026-${String(month).padStart(2, '0')}-15T10:00:00.000Z`;
    const text = await metaText(metaSeed(stamp, [metaRow(longLeader, 61.25, 14800)]), Date.parse(stamp) + 3600_000);
    assert.ok(text.title.length <= 65, `title of month ${month}: ${text.title.length}`);
    assert.ok(text.description.length <= 160, `description of month ${month}: ${text.description.length}`);
    assert.ok(text.title.includes('Hearthstone') && !text.title.includes('HSGuru'), `title of month ${month}`);
    assert.ok(text.description.includes(' на 15 ') && text.description.endsWith('Данные HSGuru.'), `description of month ${month}`);
    assert.equal(text.description.split('(хс)').length - 1, 1, `one «(хс)» in month ${month}`);
  }
  for (const text of [staticPage(META), staticPage(CATALOG)]) {
    assert.ok(text.title.length <= 65 && text.description.length <= 160, `${text.pathname} static text fits`);
    assert.equal(text.description.split('(хс)').length - 1, 1);
  }

  // Catalog: month in the title, date and size in the description.
  const catalogOf = (count: number, updatedAt: string | null = FRESH, format: 'standard' | 'wild' = 'standard') =>
    publicArchetypeCatalog({
      format, formatLabel: format === 'standard' ? 'Стандарт' : 'Вольный', patch: '36.6.3', period: 'patch_36.6.3',
      minimumGames: 50, updatedAt,
      items: Array.from({ length: count }, (_, index) => ({
        slug: `a-${index}`, format, classKey: 'mage', archetype: `A ${index}`, archetypeLabel: `А ${index}`, translated: true,
        games: 100, winrate: 50, popularity: 1, turns: 8, durationMinutes: 7, climbingSpeed: 1, deckCount: 1, sourceUrl: '',
      })),
    }, format);
  const catalogText = async (catalog: ReturnType<typeof catalogOf>, now = NOW) =>
    seoPageText(staticPage(CATALOG), archetypeCatalogSeoValues(catalog, now));
  assert.deepEqual(await catalogText(catalogOf(193)), {
    title: 'Архетипы Hearthstone: винрейт, октябрь 2026 | HearthPulse',
    description: 'Архетипы колод Хартстоуна (хс) на 29 октября 2026: 193 архетипа Стандарта — винрейт, популярность и число игр. Данные HSGuru.',
  });
  for (const [count, phrase] of [[1, '1 архетип Стандарта'], [2, '2 архетипа Стандарта'], [5, '5 архетипов Стандарта'],
    [11, '11 архетипов Стандарта'], [21, '21 архетип Стандарта']] as const) {
    assert.ok((await catalogText(catalogOf(count))).description.includes(phrase), phrase);
  }
  assert.ok((await catalogText(catalogOf(40, FRESH, 'wild'))).description.includes('40 архетипов Вольного формата'));
  assert.equal((await catalogText(catalogOf(193, '2026-10-20T10:00:00.000Z'))).description,
    'Архетипы колод Хартстоуна (хс), обновлено 20 октября 2026: 193 архетипа Стандарта — винрейт, популярность и число игр. Данные HSGuru.');
  assert.equal((await catalogText(catalogOf(193, '2026-10-20T10:00:00.000Z'))).title, staticPage(CATALOG).title);
  const empty = await catalogText(catalogOf(0));
  assert.equal(empty.title, 'Архетипы Hearthstone: винрейт, октябрь 2026 | HearthPulse', 'an empty catalog still has a date');
  assert.equal(empty.description, staticPage(CATALOG).description, 'an empty catalog promises no count');
  assert.deepEqual(await catalogText(null as never), { title: staticPage(CATALOG).title, description: staticPage(CATALOG).description });
  for (const text of [await catalogText(catalogOf(193)), await catalogText(catalogOf(193, '2026-10-20T10:00:00.000Z'))]) {
    assert.doesNotMatch(text.description, /код/i, 'deck codes are paid: the snippet does not promise them');
  }

  // Archetype page: formula in code, not in the registry.
  const detailOf = (overrides: Record<string, unknown> = {}, itemOverrides: Record<string, unknown> = {}) => publicArchetypeTeaser({
    format: 'standard', formatLabel: 'Стандарт', patch: '36.6.3', minimumGames: 50, updatedAt: FRESH,
    item: {
      slug: 'zoolock', archetype: 'Zoolock', archetypeLabel: 'Зоолок', translated: true, classKey: 'warlock', format: 'standard',
      games: 14800, winrate: 61.24, popularity: 20.4, turns: 8, durationMinutes: 7, climbingSpeed: 1, deckCount: 3,
      sourceUrl: 'https://www.hsguru.com/archetype', builds: [], ...itemOverrides,
    },
    featuredBuild: null, ...overrides,
  }, overrides.format === 'wild' ? 'wild' : 'standard', 'zoolock');
  assert.deepEqual(archetypeDetailSeoText(detailOf(), NOW), {
    title: 'Зоолок — колода Hearthstone, октябрь 2026 | HearthPulse',
    description: 'Зоолок в Стандарте (хс) на 29 октября 2026: винрейт 61,2%, 14 800 игр, период «Патч 36.6.3». Данные HSGuru.',
  });
  assert.ok(archetypeDetailSeoText(detailOf({ patch: 'black_empire_ban' }), NOW).description
    .includes(`период «${standardMetaPeriodLabel('black_empire_ban')}»`), 'the period is named by the shared label, not by a copy of it');
  assert.deepEqual(archetypeDetailSeoText(detailOf({ updatedAt: '2026-10-20T10:00:00.000Z' }), NOW), {
    title: 'Зоолок — колода Hearthstone | HearthPulse',
    description: 'Зоолок в Стандарте (хс), обновлено 20 октября 2026: винрейт 61,2%, 14 800 игр, период «Патч 36.6.3». Данные HSGuru.',
  });
  const wild = archetypeDetailSeoText(detailOf({ format: 'wild', formatLabel: 'Вольный' }, { format: 'wild' }), NOW);
  assert.ok(wild.description.startsWith('Зоолок в Вольном формате (хс) на 29 октября 2026'), wild.description);
  for (const text of [archetypeDetailSeoText(detailOf(), NOW), wild]) {
    assert.doesNotMatch(`${text.title} ${text.description}`, /стандарт режима|вольный режима/i, 'the old «…режима» slip is gone');
  }
  assert.equal(archetypeDetailSeoText(detailOf({ updatedAt: null }, { winrate: null, games: 0 }), NOW).description,
    'Зоолок в Стандарте (хс), период «Патч 36.6.3». Данные HSGuru.', 'a page without a date or numbers promises none');
  assert.equal(archetypeDetailSeoText(detailOf({}, { games: 1 }), NOW).description.includes('1 игра,'), true);
  // The longest name: the brand goes first, then the month; a name beyond that is cut. The description keeps date and source.
  for (const label of ['Колода-завоеватель с очень длинным названием', 'Колода-завоеватель с очень-очень длинным названием архетипа Стандарта',
    'Нечто '.repeat(25).trim()]) {
    const text = archetypeDetailSeoText(detailOf({}, { archetypeLabel: label }), NOW);
    assert.ok(text.title.length <= 65, `title ${text.title.length}: ${text.title}`);
    assert.ok(text.title.includes('Hearthstone'), text.title);
    assert.ok(text.description.length <= 160, `description ${text.description.length}`);
  }
  assert.equal(archetypeDetailSeoText(detailOf({}, { archetypeLabel: 'Колода-завоеватель с очень длинным названием' }), NOW).title,
    'Колода-завоеватель с очень длинным названием — колода Hearthstone', 'a name too long for the brand drops the brand, then the month');
  assert.equal(archetypeDetailSeoText(detailOf({}, { archetypeLabel: 'Колода-завоеватель с очень длинным названием' }), NOW).description
    .startsWith('Колода-завоеватель с очень длинным названием в Стандарте (хс) на 29 октября 2026: винрейт 61,2%'), true);
  assert.ok(archetypeDetailSeoText(detailOf({}, { archetypeLabel: 'Нечто '.repeat(25).trim() }), NOW).description.includes('HSGuru'));
}


console.log(`SEO registry assertions passed (${pages.length} pages, ${sitemapPages.length} sitemap URLs)`);
