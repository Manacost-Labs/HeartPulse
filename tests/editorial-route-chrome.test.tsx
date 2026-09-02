import assert from 'node:assert/strict';
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

console.log('editorial route chrome assertions passed');
