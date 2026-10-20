import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const PARCHMENT = '/wallpaper/arena-parchment-v2.webp';
const BANNER = '/wallpaper/profile-hero-hth-1430.avif';
const PHONE_BANNER = '/wallpaper/profile-hero-hth-860.avif';

// React sends a high-priority image preload in the Link response header and may
// repeat it as a <link> in the document; either one makes the browser fetch early.
async function imageHints(origin, path) {
  const response = await fetch(`${origin}${path}`);
  assert.equal(response.status, 200, path);
  const html = await response.text();
  const header = (response.headers.get('link') ?? '').split(/,\s*(?=<)/).filter(Boolean)
    .map(entry => ({ href: entry.match(/^<([^>]+)>/)?.[1], text: entry }));
  const tags = [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*>/g)]
    .map(match => ({ href: match[0].match(/href="([^"]+)"/)?.[1], text: match[0] }));
  return { html, hints: [...header, ...tags].filter(hint => /as="?image/.test(hint.text)) };
}
const hintsFor = (hints, href) => hints.filter(hint => hint.href === href);
const isHigh = hint => /fetchpriority="high"|fetchPriority="high"/.test(hint.text);
const TABLET_UP = /media="\(min-width: 768px\)"/;

let runtime;
before(async () => { runtime = await startPublicCardPilot({ pagesEnabled: true }); });
after(async () => { await runtime?.close(); });

test('image hints fetch each width only the parchment and banner files it paints', async () => {
  // Phones paint the parchment inline from tokens.css, so no page fetches the file below 768px.
  for (const path of ['/', '/faq/', '/standard/meta/', '/heroes/?view=table', '/standard/archetypes/', '/tierlist/',
    '/classes/', '/legendaries/', '/standard/matchups/', '/standard/cards/', '/standard/cards/standard/',
    '/standard/cards/wild/', '/articles/', '/cosmetics/']) {
    const { hints } = await imageHints(runtime.origin, path);
    const parchment = hintsFor(hints, PARCHMENT);
    assert.ok(parchment.length >= 1, `${path} preloads the parchment for wider screens`);
    for (const hint of parchment) {
      assert.ok(isHigh(hint), `${path} keeps the wider-screen parchment hint at high priority`);
      assert.match(hint.text, TABLET_UP, `${path} must not fetch the parchment file on phones`);
    }
  }
  // Pages whose measured LCP is the banner preload the file each width paints.
  for (const path of ['/standard/matchups/', '/standard/archetypes/', '/standard/cards/', '/standard/cards/standard/',
    '/standard/cards/wild/', '/articles/']) {
    const { hints } = await imageHints(runtime.origin, path);
    for (const [href, media] of [[BANNER, /media="\(min-width: 721px\)"/], [PHONE_BANNER, /media="\(max-width: 720px\)"/]]) {
      const banner = hintsFor(hints, href);
      assert.ok(banner.length >= 1, `${path} preloads ${href}`);
      for (const hint of banner) {
        assert.ok(isHigh(hint), path);
        assert.match(hint.text, media, `${path}: each width fetches one banner file`);
        assert.match(hint.text, /type="image\/avif"/, 'a browser without AVIF must skip the hint');
      }
    }
  }
  // Here a banner hint delayed the phone first paint, sharing bandwidth with the stylesheets.
  for (const path of ['/tierlist/', '/classes/', '/legendaries/', '/heroes/?view=table', '/cosmetics/']) {
    const { hints } = await imageHints(runtime.origin, path);
    assert.equal(hintsFor(hints, BANNER).length + hintsFor(hints, PHONE_BANNER).length, 0, path);
  }
  for (const path of ['/tierlist/', '/standard/matchups/', '/heroes/?view=table', '/standard/cards/', '/articles/']) {
    const { hints } = await imageHints(runtime.origin, path);
    // The WebP is only the image-set() fallback: preloading it would download both files.
    assert.equal(hintsFor(hints, '/wallpaper/profile-hero-hth.webp').length, 0, path);
  }
});

test('the home mural offers AVIF by width and keeps the WebP image as the fallback', async () => {
  const { html, hints } = await imageHints(runtime.origin, '/');
  const picture = html.match(/<figure class="home-stage__character"[^]*?<\/figure>/)?.[0] ?? '';
  const source = picture.match(/<source\b[^>]*>/)?.[0] ?? '';
  assert.match(source, /type="image\/avif"/);
  for (const width of [720, 960, 1280]) {
    assert.match(source, new RegExp(`/wallpaper/home-paladin-hero-${width}\\.avif ${width}w`));
  }
  assert.match(source, /sizes="\(max-width: 900px\) 88vw/);
  assert.match(picture, /<img\b[^>]*src="\/wallpaper\/home-paladin-hero\.webp"[^>]*fetchPriority="high"/);
  // The mural is not the LCP element; a head preload of it would race the parchment.
  assert.equal(hints.filter(hint => /home-paladin-hero/.test(hint.href ?? '')).length, 0);
});
