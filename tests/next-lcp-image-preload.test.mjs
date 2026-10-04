import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const PARCHMENT = '/wallpaper/arena-parchment-v2.webp';
const BANNER = '/wallpaper/profile-hero-hth-1430.avif';

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

test('pages preload the image that is their measured LCP element, and only that one', async () => {
  for (const path of ['/', '/faq/', '/standard/meta/', '/heroes/?view=table']) {
    const { hints } = await imageHints(runtime.origin, path);
    const parchment = hintsFor(hints, PARCHMENT);
    assert.ok(parchment.length >= 1 && parchment.every(isHigh), `${path} preloads the parchment at high priority`);
    assert.ok(parchment.every(hint => !/media=/.test(hint.text)), `${path} paints the parchment first at every width`);
  }
  // Phones paint text, banner art or an image first here; from 768px the parchment.
  for (const path of ['/tierlist/', '/classes/', '/legendaries/', '/standard/matchups/', '/standard/archetypes/']) {
    const { hints } = await imageHints(runtime.origin, path);
    const parchment = hintsFor(hints, PARCHMENT);
    assert.ok(parchment.length >= 1, `${path} preloads the parchment for wider screens`);
    for (const hint of parchment) {
      assert.ok(isHigh(hint), path);
      assert.match(hint.text, TABLET_UP, `${path} must not fetch the parchment early on phones`);
    }
  }
  for (const path of ['/standard/matchups/', '/standard/archetypes/']) {
    const { hints } = await imageHints(runtime.origin, path);
    const banner = hintsFor(hints, BANNER);
    assert.ok(banner.length >= 1, `${path} preloads its banner`);
    for (const hint of banner) {
      assert.ok(isHigh(hint), path);
      assert.match(hint.text, /type="image\/avif"/, 'a browser without AVIF must skip the hint');
    }
  }
  for (const path of ['/tierlist/', '/standard/matchups/', '/heroes/?view=table']) {
    const { hints } = await imageHints(runtime.origin, path);
    // The WebP is only the image-set() fallback: preloading it would download both files.
    assert.equal(hintsFor(hints, '/wallpaper/profile-hero-hth.webp').length, 0, path);
  }
  const tierList = await imageHints(runtime.origin, '/tierlist/');
  assert.equal(hintsFor(tierList.hints, BANNER).length, 0, 'the tier list paints text first, never the banner');
  const heroes = await imageHints(runtime.origin, '/heroes/?view=table');
  assert.equal(hintsFor(heroes.hints, BANNER).length, 0, 'the parchment, not the banner, is the LCP of /heroes/');
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
