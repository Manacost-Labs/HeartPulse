import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { SectionBanner } from '../src/features/EditorialRouteChrome';

const html = renderToStaticMarkup(
  <SectionBanner title="Статьи" subtitle="Гайды и разборы" />,
);

assert.equal(
  [...html.matchAll(/<h1(?:\s[^>]*)?>/gi)].length,
  1,
  'the responsive editorial banner must expose exactly one H1',
);
assert.match(html, /<h1[^>]*>Статьи<\/h1>/);
assert.match(html, /class="[^"]*section-banner-modern[^\"]*"/);

const guideArchiveSource = readFileSync(new URL('../src/features/GuidesArchive.tsx', import.meta.url), 'utf8');
assert.match(
  guideArchiveSource,
  /className="site-page-hero guide-archive-hero"/,
  'the guides archive must share the public page-hero contract',
);

console.log('editorial route chrome assertions passed');
