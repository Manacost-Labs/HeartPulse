import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';

const distAssets = join(process.cwd(), 'dist', 'assets');

const budgets = {
  // Route-owned icons and Home stay out of the eager dependency graph. The
  // shell chunk may contain its own icon code, while aggregate startup limits
  // remain stricter than the previous 266 KB raw / 90 KB gzip baseline.
  mainJs: Number(process.env.BUDGET_MAIN_JS_BYTES || 56_000),
  initialJs: Number(process.env.BUDGET_INITIAL_JS_BYTES || 252_000),
  initialJsGzip: Number(process.env.BUDGET_INITIAL_JS_GZIP_BYTES || 80_000),
  vendorReact: Number(process.env.BUDGET_VENDOR_REACT_BYTES || 194_000),
  routeJs: Number(process.env.BUDGET_ROUTE_JS_BYTES || 116_000),
  css: Number(process.env.BUDGET_CSS_BYTES || 131_000),
  routeCss: Number(process.env.BUDGET_ROUTE_CSS_BYTES || 48_000),
  deferredRoutesCss: Number(process.env.BUDGET_DEFERRED_ROUTES_CSS_BYTES || 52_000),
  loginPanelCss: Number(process.env.BUDGET_LOGIN_PANEL_CSS_BYTES || 4_500),
  homeSectionCss: Number(process.env.BUDGET_HOME_SECTION_CSS_BYTES || 5_000),
  faqSectionCss: Number(process.env.BUDGET_FAQ_SECTION_CSS_BYTES || 4_000),
  supportPromptCss: Number(process.env.BUDGET_SUPPORT_PROMPT_CSS_BYTES || 4_000),
  siteFooterCss: Number(process.env.BUDGET_SITE_FOOTER_CSS_BYTES || 4_000),
  routeMetaJs: Number(process.env.BUDGET_ROUTE_META_JS_BYTES || 5_000),
};

const files = readdirSync(distAssets)
  .map(name => ({ name, bytes: statSync(join(distAssets, name)).size }))
  .sort((a, b) => b.bytes - a.bytes);

const mainJs = files.find(file =>
  /^index-.*\.js$/.test(file.name)
  && !file.name.startsWith('vendor-')
);
const routeJs = files.filter(file =>
  /\.js$/.test(file.name)
  && !/^index-/.test(file.name)
  && !file.name.startsWith('vendor-')
);
const css = files.find(file => /^index-.*\.css$/.test(file.name));
const routeCss = files.find(file => /^route-parchment-.*\.css$/.test(file.name));
const deferredRoutesCss = files.find(file => /^DeferredRoutes-.*\.css$/.test(file.name));
const loginPanelCss = files.find(file => /^LoginPanel-.*\.css$/.test(file.name));
const faqSectionCss = files.find(file => /^FAQSection-.*\.css$/.test(file.name));
const supportPromptCss = files.find(file => /^SupportPrompt-.*\.css$/.test(file.name));
const siteFooterCss = files.find(file => /^SiteFooter-.*\.css$/.test(file.name));
const routeMetaJs = files.find(file => /^route-meta-.*\.js$/.test(file.name));
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
  ['initial CSS', css, budgets.css],
  ['shared route CSS', routeCss, budgets.routeCss],
  ['deferred route-owner CSS', deferredRoutesCss, budgets.deferredRoutesCss],
  ['lazy public-auth CSS', loginPanelCss, budgets.loginPanelCss],
  ['largest lazy home-section CSS', largestHomeSectionCss, budgets.homeSectionCss],
  ['lazy FAQ-section CSS', faqSectionCss, budgets.faqSectionCss],
  ['lazy support-prompt CSS', supportPromptCss, budgets.supportPromptCss],
  ['lazy site-footer CSS', siteFooterCss, budgets.siteFooterCss],
  ['lazy route-metadata JS', routeMetaJs, budgets.routeMetaJs],
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
