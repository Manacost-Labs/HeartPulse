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

const YEAR = String(new Date().getUTCFullYear());
const REGISTRY_PAGES = Object.entries(JSON.parse(readFileSync('config/public-seo-pages.json', 'utf8')).pages)
  .map(([path, page]) => ({
    path, url: path === '/' ? '/' : `${path}/`, sitemap: page.sitemap,
    title: page.title.replaceAll('{year}', YEAR), description: page.description.replaceAll('{year}', YEAR),
  }));

// React escapes text and attribute values in server HTML.
function decoded(value) {
  return value.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

/** Text a reader gets without JavaScript: no tags and no script or style contents. */
function visibleText(html) {
  const lower = html.toLowerCase();
  let text = '';
  let index = 0;
  while (index < html.length) {
    const open = html.indexOf('<', index);
    if (open === -1) { text += html.slice(index); break; }
    text += html.slice(index, open);
    const close = html.indexOf('>', open);
    if (close === -1) break;
    index = close + 1;
    const name = lower.slice(open + 1, close).split(/[\s/]/, 1)[0];
    if (name === 'script' || name === 'style') {
      const end = lower.indexOf(`</${name}`, index);
      index = end === -1 ? html.length : html.indexOf('>', end) + 1;
    }
  }
  return decoded(text);
}

function assertOnce(html, pattern, expected, label) {
  assert.deepEqual([...html.matchAll(pattern)].map(match => decoded(match[1])), [expected], label);
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

test('every SEO registry page takes its title, description and share metadata from the registry', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  try {
    for (const page of REGISTRY_PAGES) {
      const response = await fetch(`${runtime.nextOrigin}${page.url}`, { redirect: 'manual' });
      assert.equal(response.status, 200, page.path);
      const html = await response.text();
      assertOnce(html, /<title>([^<]*)<\/title>/g, page.title, `${page.path} title`);
      assertOnce(html, /<meta name="description" content="([^"]*)"/g, page.description, `${page.path} description`);
      assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${page.path} must render exactly one H1`);
      if (!page.sitemap) {
        assertOnce(html, /<meta name="robots" content="([^"]*)"/g, 'noindex, nofollow', `${page.path} robots`);
        assert.doesNotMatch(html, /<link rel="canonical"/, `${page.path} must not expose a canonical URL`);
        assert.doesNotMatch(html, /<meta property="og:url"/, `${page.path} must not expose og:url`);
        assert.doesNotMatch(html, /application\/ld\+json/, `${page.path} must not carry structured data`);
        continue;
      }
      const canonical = `https://hearthpulse.net${page.url}`;
      assertOnce(html, /<meta name="robots" content="([^"]*)"/g,
        'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1', `${page.path} robots`);
      assertOnce(html, /<link rel="canonical" href="([^"]*)"/g, canonical, `${page.path} canonical`);
      assertOnce(html, /<meta property="og:title" content="([^"]*)"/g, page.title, `${page.path} og:title`);
      assertOnce(html, /<meta property="og:description" content="([^"]*)"/g, page.description, `${page.path} og:description`);
      assertOnce(html, /<meta property="og:url" content="([^"]*)"/g, canonical, `${page.path} og:url`);
      assertOnce(html, /<meta name="twitter:title" content="([^"]*)"/g, page.title, `${page.path} twitter:title`);
      assertOnce(html, /<meta name="twitter:description" content="([^"]*)"/g, page.description,
        `${page.path} twitter:description`);
    }

    const shareAlt = async path => (await head(runtime.nextOrigin, path)).match(/<meta property="og:image:alt" content="([^"]*)"/)?.[1];
    assert.notEqual(await shareAlt('/cosmetics/'), await shareAlt('/cosmetics/heroes/'),
      'the cosmetics hub is not the hero skins listing');

    // The legal documents must stay readable without JavaScript.
    const legalPages = JSON.parse(readFileSync('src/modules/legalPages/content.json', 'utf8')).pages;
    for (const [kind, legal] of Object.entries(legalPages)) {
      const html = await (await fetch(`${runtime.nextOrigin}/${kind}/`)).text();
      const text = visibleText(html);
      assert.ok(text.includes(legal.title), `${kind} title`);
      for (const section of legal.sections) {
        assert.ok(text.includes(section.heading), `${kind} heading: ${section.heading}`);
        for (const paragraph of section.paragraphs) {
          const expected = paragraph.replace('{{telegram}}', 'Telegram Manacost')
            .replace('{{privacy}}', 'Политика конфиденциальности');
          assert.ok(text.includes(expected), `${kind} paragraph: ${expected.slice(0, 60)}`);
        }
      }
    }
  } finally {
    await runtime.close();
  }
});

test('registry pages without request input stay prerendered', () => {
  const prerendered = Object.keys(JSON.parse(readFileSync('apps/public-web/.next/prerender-manifest.json', 'utf8')).routes);
  for (const path of ['/faq', '/privacy', '/terms', '/developers/api', '/connect']) {
    assert.ok(prerendered.includes(path), `${path} must not read the request in generateMetadata`);
  }
});

test('indexable Next pages take their robots directives from the shared URL policy', () => {
  const sources = readdirSync('apps/public-web', { recursive: true })
    .filter(file => /\.tsx?$/.test(file))
    .map(file => join('apps/public-web', file));
  const handWritten = sources.filter(file => /robots:\s*\{\s*index:\s*(?:true|policy)/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(handWritten, [], 'use policy.robots or INDEXABLE_ROBOTS so preview directives are not dropped');
});
