import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const publicSize = url => statSync(new URL(`public${url.split('?')[0]}`, root)).size;
const cssFiles = dir => readdirSync(new URL(dir, root), { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.css'))
  .map(entry => join(entry.parentPath, entry.name));

test('the parchment is one token on a compact WebP; only the newsletter keeps the JPEG', () => {
  const token = read('src/styles/tokens.css').match(/--arena-parchment-texture:\s*url\('([^']+)'\)/)?.[1];
  assert.equal(token, '/wallpaper/arena-parchment-v2.webp');
  assert.ok(publicSize(token) <= 20_000, `${token} is ${publicSize(token)} B`);
  for (const file of cssFiles('src')) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /arena-parchment\.jpg/, `${file} must use var(--arena-parchment-texture)`);
  }
  // Mail clients render no WebP, and the old URL stays valid for cached pages.
  assert.match(read('server/index.ts'), /\/wallpaper\/arena-parchment\.jpg/);
  assert.ok(existsSync(new URL('public/wallpaper/arena-parchment.jpg', root)));
  const shell = read('src/app/shell/PublicPageShell.tsx');
  assert.match(shell, new RegExp(`PARCHMENT_TEXTURE_URL = '${token}'`), 'the shell preloads the file the token paints');
});

test('the page banner paints the AVIF where image-set() type() works and the WebP elsewhere', () => {
  const banner = read('src/features/TraditionalModeBanner.css');
  const avif = read('apps/public-web/ui/PageBannerPreload.tsx').match(/PAGE_BANNER_AVIF_URL = '([^']+)'/)?.[1];
  assert.equal(avif, '/wallpaper/profile-hero-hth-1430.avif');
  assert.ok(publicSize(avif) < publicSize('/wallpaper/profile-hero-hth.webp'));
  // The build merges a same-rule fallback declaration away, so the AVIF lives in
  // an @supports rule and the base rule keeps the WebP for older browsers.
  const base = banner.match(/::before \{[^}]*\}/)?.[0] ?? '';
  assert.match(base, /url\('\/wallpaper\/profile-hero-hth\.webp'\) right center \/ cover no-repeat;/);
  assert.doesNotMatch(base, /avif/);
  const supported = banner.match(/@supports \(background-image: image-set\(url\('([^']+)'\) type\('image\/avif'\)\)\) \{[^]*?\n\}/);
  assert.equal(supported?.[1], avif);
  assert.match(supported[0], new RegExp(`url\\('${avif}'\\) type\\('image/avif'\\)`));
  assert.match(supported[0], /url\('\/wallpaper\/profile-hero-hth\.webp'\) type\('image\/webp'\)/);
});

test('the home mural offers responsive AVIF files', () => {
  const hero = read('src/modules/home/ui/HomeHero.tsx');
  assert.match(hero, /<source type="image\/avif" srcSet=\{HERO_AVIF_SRCSET\} sizes=\{HERO_SIZES\} \/>/);
  for (const width of [720, 960, 1280]) {
    assert.ok(publicSize(`/wallpaper/home-paladin-hero-${width}.avif`) < 48_000);
  }
});

test('UI icons point at files near their rendered size', () => {
  const sources = [
    'src/features/DeferredRoutes.tsx',
    'src/features/ConstructedArchetypes.tsx',
    'src/features/StandardCards.tsx',
    'src/features/StandardMeta.tsx',
    'src/features/constructedCardFilterOptions.ts',
    'src/components/SubscriptionPurchaseButtons.tsx',
    'src/modules/identity/ui/AccountBrandIcon.tsx',
    'src/modules/arenaClasses/ui/ArenaClassesBoard.tsx',
  ];
  const icon = /['"](\/(?:class_icon|ad|source-logos|assets)\/[^'"`$]+\.(?:png|webp|avif)|\/card-format-[a-z]+\.webp)['"]/g;
  const urls = new Set(sources.flatMap(file => [...read(file).matchAll(icon)].map(match => match[1])));
  assert.ok(urls.size >= 20, `found only ${urls.size} icon URLs`);
  for (const url of urls) {
    // Icons render at 20-56 CSS px. The originals these replaced were 17-255 KiB.
    assert.ok(publicSize(url) <= 12 * 1024, `${url} is ${publicSize(url)} B`);
  }
});
