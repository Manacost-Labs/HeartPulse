/**
 * Route table for tests/skeleton-route-geometry-browser.test.mjs.
 *
 * Each route names the page, the fixture API answers it needs, the request
 * that is HELD while the skeleton is measured, and the parts to compare.
 * A part pairs a skeleton selector with the loaded selector it must match:
 *   check 'fixed'    — x/top ≤2/4 px, width ≤2 px, height ≤4 px;
 *   check 'text'     — x/width as fixed, height within the real short/long
 *                      loaded range (the route's `short` variant is loaded too);
 *   check 'viewport' — x/width as fixed, height reserves at least one viewport
 *                      of the loaded element (all of it when it is shorter);
 *   check 'width'    — x/width (and top) only, for unbounded content.
 * The FIRST part is the main container: the swap's layout shift is observed
 * with it scrolled to the top of the viewport.
 * `top: false` skips the vertical position check for parts that follow
 * variable-height content. `index` selects the n-th match (default 0).
 *
 * `via: { from, click }` reaches the page by a client navigation: the harness
 * loads `from`, starts holding, then clicks `click`.
 *
 * `respond(url, { browser, variant })` returns `{ status?, body }` or
 * `undefined` (falls through to the shared handlers). `browser` is true for
 * requests that came through the gateway (the browser), false for the Next
 * server's own reads. `hold(url, { browser })` marks the request(s) kept open
 * until the harness releases them. `variant` is 'long' or 'short'.
 */

const NOW = '2026-10-20T09:00:00.000Z';
const media = (width, height, tag = 'x') => `/fixture-media/${width}x${height}.svg?${tag}`;
const pick = (variant, long, short) => (variant === 'short' ? short : long);

const FUN_CLASSES = ['MAGE', 'DRUID', 'PALADIN', 'WARLOCK', 'DEATHKNIGHT', 'ROGUE', 'HUNTER', 'PRIEST'];
function funDecks(variant) {
  const decks = FUN_CLASSES.map((className, index) => ({
    title: pick(variant, `Колода с очень длинным названием про необычную идею номер ${index + 1}, которая переносится`, `Идея ${index + 1}`),
    deckCode: `AAECAfixtureFunDeck${index + 1}`,
    format: index % 3 === 2 ? 'wild' : 'standard',
    className,
    streamer: pick(variant, 'Стример с длинным псевдонимом', null),
    funScore: 0.71 - index * 0.01, maxMetaSimilarity: 0.31, nearestArchetype: 'Мех-маг',
    winRate: 52.4, games: 1240 + index, reasons: ['Редкие сочетания'],
    url: 'https://www.hsguru.com/decks/fixture',
    firstSeenAt: `2026-10-${String(19 - index).padStart(2, '0')}T10:00:00.000Z`, lastSeenAt: NOW,
  }));
  return { fetchedAt: NOW, stats: { total: decks.length, standard: 5, wild: 3 },
    methodology: { detectorVersion: 'fixture', minFunScore: 0.55, maxMetaSimilarity: 0.42 }, decks };
}

const heroName = variant => pick(variant,
  { ru: 'Архимаг Антонидас из далёкого будущего Даларана', en: 'Archmage Antonidas of the Distant Dalaran Future' },
  { ru: 'Джайна', en: 'Jaina' });
function heroSummary(index, variant) {
  return { cardId: `HERO_QA_${String(index + 1).padStart(3, '0')}`, dbf: 1000 + index, name: heroName(variant),
    class: { slug: 'mage', nameRu: 'Маг' }, rarity: { slug: 'legendary', nameRu: 'Легендарный' },
    categorySlugs: ['money'], images: { static: media(500, 650, `hero${index}`), animated: null } };
}
function heroDetail(variant) {
  return { ...heroSummary(0, variant), health: 30, character: 'Jaina', actor: pick(variant, 'Актриса озвучки с длинным именем', null),
    artist: pick(variant, 'Художник Blizzard Entertainment', null),
    categories: pick(variant, [{ slug: 'money', nameRu: 'За деньги и в наборах' }, { slug: 'events_promos', nameRu: 'Ивенты и акции' },
      { slug: 'battle_pass', nameRu: 'Боевой пропуск' }], [{ slug: 'money', nameRu: 'За деньги' }]),
    images: { static: media(500, 650, 'hero0'), animated: null, fullArt: media(1024, 1024, 'full') },
    gallery: [], sounds: [], sourceUrl: pick(variant, 'https://hearthstone.wiki.gg/wiki/Fixture', null) };
}

function guideItem(index, variant) {
  return { id: index + 1, slug: index === 0 ? 'arena-100-percent' : `guide-${index + 1}`,
    title: pick(variant, `Подробный гайд по Арене номер ${index + 1}: как собрать колоду и выиграть двенадцать игр подряд`, `Гайд ${index + 1}`),
    description: pick(variant, 'Разбираем драфт, кривую маны, приоритеты выбора карт и типичные ошибки на старте забега, а также тонкости розыгрыша.', ''),
    image: media(1200, 675, `guide${index}`), publishedAt: '2026-07-10T12:00:00.000Z',
    menuName: pick(variant, 'Арена', null), menuCode: null, kind: 'Гайды', kindSlug: 'guides', oldUrl: null };
}
function guideDetail(variant) {
  const paragraph = 'Сильная Арена начинается с драфта: оценивайте карты по кривой маны, ищите удаление и не забывайте о синергиях. ';
  const contentHtml = pick(variant,
    Array.from({ length: 14 }, (_, index) => `<h2>Раздел ${index + 1}</h2><p>${paragraph.repeat(4)}</p>`).join(''),
    `<p>${paragraph}</p>`);
  return { ...guideItem(0, variant), keywords: null, replyCount: 3, contentHtml, fallbackText: '', sourceUrl: null };
}

const ARENA_CLASSES = [
  // The ids /api/winrates returns (server/data/winrates.json); each one has a class icon.
  ['mage', 'Маг', '#2b5c85'], ['demon-hunter', 'Охотник на демонов', '#556d24'], ['death-knight', 'Рыцарь смерти', '#1f252d'],
  ['druid', 'Друид', '#8b4d25'], ['hunter', 'Охотник', '#3f792f'], ['paladin', 'Паладин', '#a77816'],
  ['priest', 'Жрец', '#6e6862'], ['rogue', 'Разбойник', '#55545b'], ['shaman', 'Шаман', '#2f4f8f'],
  ['warlock', 'Чернокнижник', '#6a3f8c'], ['warrior', 'Воин', '#8f2f2f'],
];

const TIER_SECTIONS = [...ARENA_CLASSES.map(([id, name]) => [id, name]), ['any', 'Нейтральные']];
function tierList() {
  const cards = ['S', 'A'].flatMap(tier => Array.from({ length: 12 }, (_, index) => ({
    cardId: `TIER_${tier}_${index + 1}`, name: `Карта ${tier}${index + 1}`, score: tier === 'S' ? 90 : 80, rarity: 'common', classKey: 'any' })));
  return { source: 'hsreplay.net', updatedAt: NOW,
    sections: TIER_SECTIONS.map(([id, name]) => ({ id, name, color: '#745133', textDark: true, totalCards: cards.length, tiers: [
      { tier: 'S', label: 'Отлично', description: '', cards: cards.slice(0, 12) },
      { tier: 'A', label: 'Хорошо', description: '', cards: cards.slice(12) }] })),
    cards: Object.fromEntries(cards.map(card => [card.cardId, { cost: 3, type: 'MINION', imageHa: '', imageRu: media(512, 776, card.cardId) }])) };
}

// Real names run 4–31 (key card) and 5–29 (companions) characters; most groups have three companions.
function legendaryGroups(variant) {
  const legendary = (cardId, name) => ({ cardId, name, imageRu: media(512, 776, cardId), imageHa: '' });
  return { source: 'hsreplay.net', updatedAt: NOW, groups: Array.from({ length: 9 }, (_, index) => ({
    keyCard: legendary(`LEG_KEY_${index + 1}`, pick(variant, 'Изера Неспящая, Аспект Сновидений', 'Рагнарос')),
    cards: [0, 1, 2].map(slot => legendary(`LEG_${index + 1}_${slot + 1}`, pick(variant, 'Повелительница Небесной выси', 'Огонь'))),
    winRate: 58.6 - index, pickRate: 21.4, offerRate: 33.2, score: 74, classKey: 'any' })) };
}

const json = body => ({ body });
const unavailable = { status: 503, body: { error: 'Fixture first-paint read unavailable' } };

const COSMETICS_DETAIL_PARTS = [
  { name: 'detail', skeleton: '.loading-surface__blocks.cosmetics-detail', loaded: 'article.cosmetics-detail', check: 'viewport' },
  { name: 'back', skeleton: '.cosmetics-detail-skeleton__back', loaded: 'article.cosmetics-detail > .cosmetics-back', check: 'fixed' },
  { name: 'banner', skeleton: '.cosmetics-detail-skeleton__heading', loaded: 'article.cosmetics-detail .section-banner-modern', check: 'text' },
  { name: 'hero', skeleton: '.loading-surface .cosmetics-detail-hero', loaded: 'article.cosmetics-detail .cosmetics-detail-hero', check: 'text', top: false },
  { name: 'media', skeleton: '.loading-surface .cosmetics-detail-primary-media', loaded: 'article.cosmetics-detail .cosmetics-detail-primary-media', check: 'fixed', top: false },
  { name: 'copy', skeleton: '.loading-surface .cosmetics-detail-copy', loaded: 'article.cosmetics-detail .cosmetics-detail-copy', check: 'text', top: false },
];

function cosmeticsDetailResponse(url, { variant }) {
  if (url.pathname === '/api/cosmetics/heroes/HERO_QA_001') return { body: heroDetail(variant) };
  if (url.pathname !== '/api/cosmetics/heroes') return undefined;
  return { body: { items: Array.from({ length: 24 }, (_, index) => heroSummary(index, 'long')),
    pagination: { page: 1, perPage: 48, total: 24, totalPages: 1 }, updatedAt: NOW, source: 'fixture' } };
}

// apps/public-web/proxy.ts probes the cosmetics detail on the server before
// it renders the document or answers a client navigation, so the page has no
// client fetch to hold: only a route-level loading UI (owned by navigation)
// can show while the server is slow. The rows stay measurable on demand.
const AWAITS_ROUTE_LOADING_UI = 'route-level loading UI for the server-probed detail';

export const SKELETON_ROUTES = [
  {
    id: 'fun-decks', path: '/standard/fun-decks/', textVariants: true,
    // The server's 600 ms first-paint read fails, so the browser request is the one held.
    respond: (url, { browser, variant }) => url.pathname === '/api/fun-decks' ? (browser ? json(funDecks(variant)) : unavailable) : undefined,
    hold: (url, { browser }) => browser && url.pathname === '/api/fun-decks',
    skeleton: '.loading-surface__blocks.fun-decks-grid', loaded: 'section.fun-decks-grid > .fun-deck-card',
    parts: [
      { name: 'grid', skeleton: '.loading-surface__blocks.fun-decks-grid', loaded: 'section.fun-decks-grid', check: 'viewport' },
      ...[0, 1, 2].map(index => ({ name: `card ${index + 1}`, index, check: 'text', top: index === 0,
        skeleton: '.loading-surface__blocks.fun-decks-grid > .fun-deck-card', loaded: 'section.fun-decks-grid > .fun-deck-card' })),
      { name: 'card 1 metrics', skeleton: '.fun-deck-card--loading .fun-deck-skeleton-metrics', loaded: 'section.fun-decks-grid .fun-deck-card__metrics', check: 'fixed', top: false },
      { name: 'card 1 preview+copy', skeleton: '.fun-deck-card--loading .fun-deck-card__deck', loaded: 'section.fun-decks-grid .fun-deck-card__deck', check: 'fixed', top: false },
    ],
  },
  {
    awaits: AWAITS_ROUTE_LOADING_UI,
    id: 'cosmetics-detail', path: '/cosmetics/heroes/HERO_QA_001/', textVariants: true,
    // The page reads the detail on the server; only a route-level loading UI can show while it is held.
    respond: cosmeticsDetailResponse,
    hold: url => url.pathname === '/api/cosmetics/heroes/HERO_QA_001',
    skeleton: '.loading-surface .cosmetics-detail-hero', loaded: 'article.cosmetics-detail .cosmetics-detail-hero',
    parts: COSMETICS_DETAIL_PARTS,
  },
  {
    // The same page reached the usual way: a client navigation from the catalog.
    awaits: AWAITS_ROUTE_LOADING_UI,
    id: 'cosmetics-detail-nav', path: '/cosmetics/heroes/HERO_QA_001/', textVariants: true,
    via: { from: '/cosmetics/heroes/', click: '.cosmetics-grid-heroes a[href*="HERO_QA_001"]' },
    respond: cosmeticsDetailResponse,
    hold: url => url.pathname === '/api/cosmetics/heroes/HERO_QA_001',
    skeleton: '.loading-surface .cosmetics-detail-hero', loaded: 'article.cosmetics-detail .cosmetics-detail-hero',
    parts: COSMETICS_DETAIL_PARTS,
  },
  {
    id: 'guide-detail', path: '/guides-archive/arena-100-percent/', textVariants: true,
    respond: (url, { variant }) => {
      if (url.pathname === '/api/guides-archive/teaser/arena-100-percent') {
        const { title, description, image, publishedAt, kind, kindSlug, menuName, slug } = guideItem(0, 'long');
        return json({ slug, title, description, image, publishedAt, kind, kindSlug, menuName });
      }
      return url.pathname === '/api/guides-archive/arena-100-percent' ? json(guideDetail(variant)) : undefined;
    },
    hold: (url, { browser }) => browser && url.pathname === '/api/guides-archive/arena-100-percent',
    // Either the whole detail is a skeleton, or the server teaser's back control,
    // banner and header stay on screen and only the reader is a placeholder.
    skeleton: '.loading-surface .guide-archive-reader', loaded: 'article.guide-archive-detail .guide-archive-reader',
    parts: [
      { name: 'detail', skeleton: '.loading-surface__blocks.guide-archive-detail, article.guide-archive-detail', loaded: 'article.guide-archive-detail', check: 'viewport' },
      { name: 'back', skeleton: '.guide-detail-skeleton__back, article.guide-archive-detail > .guide-archive-back', loaded: 'article.guide-archive-detail > .guide-archive-back', check: 'fixed' },
      { name: 'banner', skeleton: '.guide-detail-skeleton__banner, article.guide-archive-detail .section-banner-modern', loaded: 'article.guide-archive-detail .section-banner-modern', check: 'text' },
      { name: 'header', skeleton: '.loading-surface .guide-archive-detail-header, article.guide-archive-detail .guide-archive-detail-header', loaded: 'article.guide-archive-detail .guide-archive-detail-header', check: 'text', top: false },
      { name: 'reader', skeleton: '.loading-surface .guide-archive-reader', loaded: 'article.guide-archive-detail .guide-archive-reader', check: 'viewport', top: false },
    ],
  },
  {
    id: 'guides-list', path: '/guides-archive/', textVariants: true,
    respond: (url, { variant }) => url.pathname === '/api/guides-archive' ? json({ page: 1, limit: 18, total: 30, totalPages: 2,
      items: Array.from({ length: 18 }, (_, index) => guideItem(index, variant)),
      filters: { kinds: [{ slug: 'guides', label: 'Гайды', count: 30 }], menus: [] } }) : undefined,
    hold: (url, { browser }) => browser && url.pathname === '/api/guides-archive',
    skeleton: '.loading-surface__blocks.guide-archive-grid', loaded: '.guide-archive-grid > a.guide-archive-card',
    parts: [
      { name: 'grid', skeleton: '.loading-surface__blocks.guide-archive-grid', loaded: '.guide-archive-grid:not(.loading-surface__blocks)', check: 'viewport' },
      ...[0, 1, 2].map(index => ({ name: `card ${index + 1}`, index, check: 'text', top: index === 0,
        skeleton: '.loading-surface__blocks.guide-archive-grid > .guide-archive-card', loaded: '.guide-archive-grid > a.guide-archive-card' })),
      { name: 'card 1 cover', skeleton: '.guide-archive-card-skeleton .guide-archive-card-media', loaded: 'a.guide-archive-card .guide-archive-card-media', check: 'fixed', top: false },
    ],
  },
  {
    id: 'cosmetics-list', path: '/cosmetics/heroes/', textVariants: true,
    respond: (url, { browser, variant }) => url.pathname === '/api/cosmetics/heroes'
      ? (browser ? json({ items: Array.from({ length: 24 }, (_, index) => heroSummary(index, variant)),
        pagination: { page: 1, perPage: 48, total: 24, totalPages: 1 }, updatedAt: NOW, source: 'fixture' }) : unavailable)
      : undefined,
    hold: (url, { browser }) => browser && url.pathname === '/api/cosmetics/heroes',
    skeleton: '.cosmetics-grid-loading', loaded: '.cosmetics-grid-heroes > .cosmetics-card',
    parts: [
      { name: 'grid', skeleton: '.cosmetics-grid-loading', loaded: '.cosmetics-grid.cosmetics-grid-heroes', check: 'viewport' },
      ...[0, 1, 2].map(index => ({ name: `card ${index + 1}`, index, check: 'text', top: index === 0,
        skeleton: '.cosmetics-grid-loading > .cosmetics-card', loaded: '.cosmetics-grid-heroes > .cosmetics-card' })),
      { name: 'card 1 media', skeleton: '.cosmetics-skeleton .cosmetics-card-media', loaded: '.cosmetics-grid-heroes .cosmetics-card-media', check: 'fixed', top: false },
    ],
  },
  {
    // «Охотник на демонов» (second) wraps in the 10rem name column from 640 px; its row stays 68 px.
    id: 'arena-classes', path: '/classes/',
    respond: url => url.pathname === '/api/winrates' ? json({ source: 'hsreplay', updatedAt: NOW,
      classes: ARENA_CLASSES.map(([id, name, color], index) => ({ id, name, color, winrate: 55 - index * 0.8, games: 12000 - index * 300 })) }) : undefined,
    hold: (url, { browser }) => browser && url.pathname === '/api/winrates',
    skeleton: '.arena-classes-loading', loaded: 'ol.arena-classes-board .arena-class-row',
    parts: [
      { name: 'board', skeleton: '.arena-classes-loading', loaded: 'ol.arena-classes-board', check: 'fixed' },
      ...[0, 1, 2].map(index => ({ name: `row ${index + 1}`, index, check: 'fixed',
        skeleton: '.arena-classes-loading .arena-class-row', loaded: 'ol.arena-classes-board .arena-class-row' })),
      { name: 'chart disclosure', skeleton: '.arena-classes-chart--loading', loaded: 'details.arena-classes-chart', check: 'fixed' },
    ],
  },
  {
    id: 'arena-tierlist', path: '/tierlist/',
    respond: url => url.pathname === '/api/tierlist' ? json(tierList()) : undefined,
    hold: (url, { browser }) => browser && url.pathname === '/api/tierlist',
    skeleton: '.tierlist-skeleton .tierlist-card-grid', loaded: '.tierlist-card-grid .hs-tier-card',
    parts: [
      { name: 'controls', skeleton: '.tierlist-skeleton .arena-tier-controls', loaded: '.arena-tier-controls', check: 'fixed' },
      ...[0, 1].map(index => ({ name: `tier ${index + 1}`, index, check: 'fixed',
        skeleton: '.tierlist-skeleton .tierlist-group', loaded: '.tierlist-groups > .tierlist-group' })),
      { name: 'card 1', skeleton: '.tierlist-skeleton-cell', loaded: '.tierlist-card-grid > .anim-scale-in', check: 'fixed' },
    ],
  },
  {
    id: 'arena-legendaries', path: '/legendaries/', textVariants: true,
    respond: (url, { variant }) => url.pathname === '/api/legendaries' ? json(legendaryGroups(variant)) : undefined,
    hold: (url, { browser }) => browser && url.pathname === '/api/legendaries',
    skeleton: '.legendary-group-card--loading', loaded: '.legendary-groups-grid > .legendary-group-card',
    parts: [
      { name: 'grid', skeleton: '.loading-surface__blocks.legendary-groups-grid', loaded: '.legendary-groups-grid', check: 'viewport' },
      ...[0, 1, 2].map(index => ({ name: `group ${index + 1}`, index, check: 'text', top: index === 0,
        skeleton: '.legendary-group-card--loading', loaded: '.legendary-groups-grid > .legendary-group-card' })),
      { name: 'group 1 key card', skeleton: '.legendary-group-card--loading .legendary-skeleton-key-card', loaded: '.legendary-group-card .legendary-card-button', check: 'fixed', top: false },
      { name: 'group 1 metrics', skeleton: '.legendary-group-card--loading .legendary-stats-footer', loaded: '.legendary-group-card .legendary-stats-footer', check: 'fixed', top: false },
    ],
  },
];
