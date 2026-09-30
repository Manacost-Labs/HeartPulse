import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// Large image, full snippet and video previews, as the shared URL policy
// (`src/shared/seo/robots.ts`) grants every indexable page.
const INDEXABLE_ROBOTS = '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"/>';

// Pages built with apps/public-web/lib/seoPageMetadata.ts, rendered by Next.
async function head(origin, path) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
  assert.equal(response.status, 200, path);
  return (await response.text()).match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
}

function jsonLdGraph(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
    .map(match => JSON.parse(match[1]))
    .find(data => Array.isArray(data['@graph']));
}

test('registry pages render canonical, robots, share metadata and JSON-LD from the SEO registries', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  try {
    const legendaries = await head(runtime.nextOrigin, '/legendaries/');
    assert.match(legendaries, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/legendaries\/"\/>/);
    assert.ok(legendaries.includes(INDEXABLE_ROBOTS), 'registry pages keep the preview directives');
    assert.match(legendaries, /<meta property="og:url" content="https:\/\/hearthpulse\.net\/legendaries\/"\/>/);
    assert.match(legendaries, /<meta property="og:image:alt" content="HearthPulse — легендарки Арены"\/>/);
    assert.match(legendaries, /<meta name="twitter:card" content="summary_large_image"\/>/);

    const home = await head(runtime.nextOrigin, '/');
    assert.match(home, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/"\/>/);

    for (const path of ['/faq/', '/developers/api/', '/gallery/', '/standard/cards/standard/',
      '/standard/cards/standard/CARD_QA_0002/', '/library/', '/cosmetics/']) {
      assert.ok((await head(runtime.nextOrigin, path)).includes(INDEXABLE_ROBOTS), `${path} robots`);
    }

    // Every entry of the structured-data registry must reach its page.
    const structuredData = JSON.parse(readFileSync('config/public-seo-structured-data.json', 'utf8')).pages;
    for (const [path, nodes] of Object.entries(structuredData)) {
      const response = await fetch(`${runtime.nextOrigin}${path === '/' ? '/' : `${path}/`}`);
      assert.equal(response.status, 200, path);
      assert.deepEqual(jsonLdGraph(await response.text())?.['@graph'].map(node => node['@type']),
        nodes.map(node => node['@type']), `${path} JSON-LD`);
    }

    const filtered = await head(runtime.nextOrigin, '/articles/?page=2');
    assert.match(filtered, /<meta name="robots" content="noindex, follow"\/>/);
    assert.match(filtered, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/articles\/"\/>/);
  } finally {
    await runtime.close();
  }
});

test('indexable Next pages take their robots directives from the shared URL policy', () => {
  const sources = readdirSync('apps/public-web', { recursive: true })
    .filter(file => /\.tsx?$/.test(file))
    .map(file => join('apps/public-web', file));
  const handWritten = sources.filter(file => /robots:\s*\{\s*index:\s*(?:true|policy)/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(handWritten, [], 'use policy.robots or INDEXABLE_ROBOTS so preview directives are not dropped');
});
