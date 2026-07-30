import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';

const distRoot = join(process.cwd(), 'dist');
const distAssets = join(distRoot, 'assets');

const budgets = {
  // Route-owned icons and Home stay out of the eager dependency graph. The
  // shell chunk may contain its own icon code, while aggregate startup limits
  // remain stricter than the previous 266 KB raw / 90 KB gzip baseline.
  // Utility header and FAQ remain lazy. The root recovery boundary is eager by
  // design so a failed route chunk can still render; keep the compressed
  // transfer ratchet unchanged and pin raw assets to that resilient baseline.
  // The accessible shared modal and optional DeckView preview now produce
  // separate lazy assets. Vite records those filenames in its eager preload
  // map (+117 raw bytes versus a6863c2), while compressed startup transfer
  // stays below the existing 80 KB ratchet.
  // v1.0.30 separates the subscriber archetype catalog into an explicit lazy
  // route; v1.0.31 adds the administrator detail stylesheet to its own lazy
  // route. v1.0.32 adds trinket filters to the Battlegrounds route and a lazy
  // constructed-deck gallery. The BG thumbnail optimizer adds 409 raw bytes
  // only to that lazy route while removing about 73 KB from every sample card
  // transfer. Compressed startup remains under 80 KB. v1.0.48 adds a 0.7 KB
  // opt-in RUM bootstrap while keeping both web-vitals and the 482 KB Sentry
  // SDK outside the startup graph; raw budgets include only that measured
  // bootstrap and the compressed 80 KB transfer ratchet remains unchanged.
  // The public Fun Decks route adds one navigation definition and one lazy
  // module pointer to the shell, plus one materialized SEO registry entry.
  // Keep those measured raw additions explicit while preserving the stricter
  // compressed startup ceiling. v1.0.72 added the constructed-card catalog
  // controls and current public route inventory after the last ratchet update.
  // v1.0.74 adds one shared lazy dependency pointer for same-origin public
  // resources (+66 raw / +16 gzip bytes in startup metadata). Keep the small
  // measured allowance explicit while retaining a tight regression ratchet.
  // v1.0.77 gives Gallery its own route chunk. One extra lazy-module pointer
  // adds 129 raw / 63 gzip bytes to the shell while removing about 108 KB from
  // Gallery navigation; keep both sides of that measured trade-off ratcheted.
  // v1.0.78 adds one footer-only developer route (+552 raw / +165 gzip bytes
  // to startup metadata), one lazy SEO record (+424 bytes), and the lazy admin
  // key workspace (+804 bytes in Contests). Reused icons keep the measured
  // additions below 1 KB per affected chunk and outside ordinary route loads.
  // v1.0.80 adds user authorization guidance to the shared developer module.
  // Its lazy admin consumer grows by 37 bytes; startup transfer remains below
  // the existing raw and gzip ceilings after account routing is extracted.
  // The noindex approval page adds 336 bytes to the lazy SEO registry so its
  // title and robots policy are correct before React loads.
  // v1.0.82 adds one lazy administrator-only Arena analytics workspace.
  // Reusing the analytics icon keeps its measured Contests pointer, navigation
  // metadata and render boundary to +718 raw bytes; the 13.7 KB workspace stays
  // in a separate chunk and never loads for other administrator sections.
  // v1.0.83 changes only that lazy workspace. Its new content hash changes the
  // compression of the eager preload map by four bytes while the raw startup
  // total remains exactly unchanged; keep the measured two-byte allowance and
  // every raw-byte ratchet explicit.
  mainJs: Number(process.env.BUDGET_MAIN_JS_BYTES || 67_710),
  initialJs: Number(process.env.BUDGET_INITIAL_JS_BYTES || 260_730),
  initialJsGzip: Number(process.env.BUDGET_INITIAL_JS_GZIP_BYTES || 80_742),
  vendorReact: Number(process.env.BUDGET_VENDOR_REACT_BYTES || 194_000),
  routeJs: Number(process.env.BUDGET_ROUTE_JS_BYTES || 134_300),
  deferredRoutesJs: Number(process.env.BUDGET_DEFERRED_ROUTES_JS_BYTES || 108_350),
  galleryPageJs: Number(process.env.BUDGET_GALLERY_PAGE_JS_BYTES || 4_700),
  editorialRouteChromeJs: Number(process.env.BUDGET_EDITORIAL_ROUTE_CHROME_JS_BYTES || 2_450),
  css: Number(process.env.BUDGET_CSS_BYTES || 136_863),
  routeCss: Number(process.env.BUDGET_ROUTE_CSS_BYTES || 48_350),
  deferredRoutesCss: Number(process.env.BUDGET_DEFERRED_ROUTES_CSS_BYTES || 52_084),
  loginPanelCss: Number(process.env.BUDGET_LOGIN_PANEL_CSS_BYTES || 4_500),
  homeSectionCss: Number(process.env.BUDGET_HOME_SECTION_CSS_BYTES || 5_000),
  faqSectionCss: Number(process.env.BUDGET_FAQ_SECTION_CSS_BYTES || 4_000),
  faqPageCss: Number(process.env.BUDGET_FAQ_PAGE_CSS_BYTES || 7_000),
  faqPageJs: Number(process.env.BUDGET_FAQ_PAGE_JS_BYTES || 5_500),
  supportPromptCss: Number(process.env.BUDGET_SUPPORT_PROMPT_CSS_BYTES || 4_000),
  siteFooterCss: Number(process.env.BUDGET_SITE_FOOTER_CSS_BYTES || 4_000),
  seoRegistryJs: Number(process.env.BUDGET_SEO_REGISTRY_JS_BYTES || 14_900),
  deckViewVendorJs: Number(process.env.BUDGET_DECK_VIEW_VENDOR_JS_BYTES || 31_000),
  deckListJs: Number(process.env.BUDGET_DECK_LIST_JS_BYTES || 6_500),
  deckListCss: Number(process.env.BUDGET_DECK_LIST_CSS_BYTES || 5_200),
  deckPreviewControllerJs: Number(process.env.BUDGET_DECK_PREVIEW_CONTROLLER_JS_BYTES || 4_350),
  deckPreviewControllerCss: Number(process.env.BUDGET_DECK_PREVIEW_CONTROLLER_CSS_BYTES || 800),
  cardPreviewSheetJs: Number(process.env.BUDGET_CARD_PREVIEW_SHEET_JS_BYTES || 1_650),
  cardPreviewSheetCss: Number(process.env.BUDGET_CARD_PREVIEW_SHEET_CSS_BYTES || 3_100),
  cardPreviewTooltipJs: Number(process.env.BUDGET_CARD_PREVIEW_TOOLTIP_JS_BYTES || 900),
  cardPreviewTooltipCss: Number(process.env.BUDGET_CARD_PREVIEW_TOOLTIP_CSS_BYTES || 650),
};

const files = readdirSync(distAssets)
  .map(name => ({ name, bytes: statSync(join(distAssets, name)).size }))
  .sort((a, b) => b.bytes - a.bytes);

const entryHtml = readFileSync(join(distRoot, 'index.html'), 'utf8');
const entryMatch = entryHtml.match(
  /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'][^"']*\/assets\/(index-[^"']+\.js)["']/i,
);
const mainJs = entryMatch
  ? files.find(file => file.name === entryMatch[1])
  : null;
const routeJs = files.filter(file =>
  /\.js$/.test(file.name)
  && !/^index-/.test(file.name)
  && !file.name.startsWith('vendor-')
);
const css = files.find(file => /^index-.*\.css$/.test(file.name));
const routeCss = files.find(file => /^route-parchment-.*\.css$/.test(file.name));
const deferredRoutesCss = files.find(file => /^(?:DeferredRoutes|EditorialRouteChrome)-.*\.css$/.test(file.name));
const deferredRoutesJs = files.find(file => /^DeferredRoutes-.*\.js$/.test(file.name));
const galleryPageJs = files.find(file => /^GalleryTab-.*\.js$/.test(file.name));
const editorialRouteChromeJs = files.find(file => /^EditorialRouteChrome-.*\.js$/.test(file.name));
const loginPanelCss = files.find(file => /^LoginPanel-.*\.css$/.test(file.name));
const faqSectionCss = files.find(file => /^FAQSection-.*\.css$/.test(file.name));
const faqPageCss = files.find(file => /^FAQPage-.*\.css$/.test(file.name));
const faqPageJs = files.find(file => /^FAQPage-.*\.js$/.test(file.name));
const supportPromptCss = files.find(file => /^SupportPrompt-.*\.css$/.test(file.name));
const siteFooterCss = files.find(file => /^SiteFooter-.*\.css$/.test(file.name));
const seoRegistryJs = files.find(file => /^registry-.*\.js$/.test(file.name));
const deckViewVendorJs = files.find(file => /^hsreplay-deck-view-.*\.js$/.test(file.name));
const deckListJs = files.find(file => /^HsReplayDeckList-.*\.js$/.test(file.name));
const deckListCss = files.find(file => /^HsReplayDeckList-.*\.css$/.test(file.name));
const deckPreviewControllerJs = files.find(file => /^HsReplayDeckPreviewController-.*\.js$/.test(file.name));
const deckPreviewControllerCss = files.find(file => /^HsReplayDeckPreviewController-.*\.css$/.test(file.name));
const cardPreviewSheetJs = files.find(file => /^CardPreviewSheet-.*\.js$/.test(file.name));
const cardPreviewSheetCss = files.find(file => /^CardPreviewSheet-.*\.css$/.test(file.name));
const cardPreviewTooltipJs = files.find(file => /^CardPreviewTooltip-.*\.js$/.test(file.name));
const cardPreviewTooltipCss = files.find(file => /^CardPreviewTooltip-.*\.css$/.test(file.name));
const homeSectionCssFiles = files.filter(file => /^Home(?:ArenaDirectory|Battlegrounds|LatestArticles)-.*\.css$/.test(file.name));
const largestHomeSectionCss = homeSectionCssFiles.length === 3
  ? homeSectionCssFiles.sort((left, right) => right.bytes - left.bytes)[0]
  : null;
const vendorReact = files.find(file => /^vendor-react-.*\.js$/.test(file.name));
const initialJsFiles = [mainJs, vendorReact]
  .filter(Boolean);
const initialJs = initialJsFiles.length === 2 ? {
  name: initialJsFiles.map(file => file.name).join(' + '),
  bytes: initialJsFiles.reduce((sum, file) => sum + file.bytes, 0),
} : null;
const initialJsGzip = initialJsFiles.length === 2 ? {
  name: 'gzip(' + initialJsFiles.map(file => file.name).join(' + ') + ')',
  bytes: initialJsFiles.reduce((sum, file) => (
    sum + gzipSync(readFileSync(join(distAssets, file.name)), { level: 9 }).length
  ), 0),
} : null;

const checks = [
  ['application shell JS', mainJs, budgets.mainJs],
  ['stable React vendor JS', vendorReact, budgets.vendorReact],
  ['initial JS raw total', initialJs, budgets.initialJs],
  ['initial JS gzip total', initialJsGzip, budgets.initialJsGzip],
  ['largest route JS', routeJs[0], budgets.routeJs],
  ['Arena deferred route JS', deferredRoutesJs, budgets.deferredRoutesJs],
  ['Gallery route JS', galleryPageJs, budgets.galleryPageJs],
  ['editorial route chrome JS', editorialRouteChromeJs, budgets.editorialRouteChromeJs],
  ['initial CSS', css, budgets.css],
  ['shared route CSS', routeCss, budgets.routeCss],
  ['Arena route-owner CSS', deferredRoutesCss, budgets.deferredRoutesCss],
  ['lazy public-auth CSS', loginPanelCss, budgets.loginPanelCss],
  ['largest lazy home-section CSS', largestHomeSectionCss, budgets.homeSectionCss],
  ['lazy FAQ-section CSS', faqSectionCss, budgets.faqSectionCss],
  ['lazy FAQ-page CSS', faqPageCss, budgets.faqPageCss],
  ['lazy FAQ-page JS', faqPageJs, budgets.faqPageJs],
  ['lazy support-prompt CSS', supportPromptCss, budgets.supportPromptCss],
  ['lazy site-footer CSS', siteFooterCss, budgets.siteFooterCss],
  ['lazy SEO registry JS', seoRegistryJs, budgets.seoRegistryJs],
  ['lazy DeckView vendor JS', deckViewVendorJs, budgets.deckViewVendorJs],
  ['lazy deck-list adapter JS', deckListJs, budgets.deckListJs],
  ['lazy deck-list recovery CSS', deckListCss, budgets.deckListCss],
  ['lazy deck-preview controller JS', deckPreviewControllerJs, budgets.deckPreviewControllerJs],
  ['lazy deck-preview controller CSS', deckPreviewControllerCss, budgets.deckPreviewControllerCss],
  ['lazy card-preview sheet JS', cardPreviewSheetJs, budgets.cardPreviewSheetJs],
  ['lazy card-preview sheet CSS', cardPreviewSheetCss, budgets.cardPreviewSheetCss],
  ['lazy card-preview tooltip JS', cardPreviewTooltipJs, budgets.cardPreviewTooltipJs],
  ['lazy card-preview tooltip CSS', cardPreviewTooltipCss, budgets.cardPreviewTooltipCss],
];

let failed = false;
for (const [label, file, budget] of checks) {
  if (!file) {
    console.error(`[budget] missing ${label} asset`);
    failed = true;
    continue;
  }
  const ok = file.bytes <= budget;
  const status = ok ? 'ok' : 'over';
  console.log(`[budget] ${status} ${label}: ${file.name} ${file.bytes} / ${budget} bytes`);
  if (!ok) failed = true;
}

console.log('[budget] aggregate startup assets are ratcheted below the previous production baseline.');

if (failed) process.exit(1);
