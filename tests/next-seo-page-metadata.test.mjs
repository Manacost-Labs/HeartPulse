import assert from 'node:assert/strict';
import test from 'node:test';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// Pages built with apps/public-web/lib/seoPageMetadata.ts, rendered by Next.
async function head(origin, path) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
  assert.equal(response.status, 200, path);
  return (await response.text()).match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
}

test('registry pages render canonical, robots and share metadata from the SEO registry', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  try {
    const legendaries = await head(runtime.nextOrigin, '/legendaries/');
    assert.match(legendaries, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/legendaries\/"\/>/);
    assert.match(legendaries, /<meta name="robots" content="index, follow"\/>/);
    assert.match(legendaries, /<meta property="og:url" content="https:\/\/hearthpulse\.net\/legendaries\/"\/>/);
    assert.match(legendaries, /<meta property="og:image:alt" content="HearthPulse — легендарки Арены"\/>/);
    assert.match(legendaries, /<meta name="twitter:card" content="summary_large_image"\/>/);

    const home = await head(runtime.nextOrigin, '/');
    assert.match(home, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/"\/>/);

    const filtered = await head(runtime.nextOrigin, '/articles/?page=2');
    assert.match(filtered, /<meta name="robots" content="noindex, follow"\/>/);
    assert.match(filtered, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/articles\/"\/>/);
  } finally {
    await runtime.close();
  }
});
