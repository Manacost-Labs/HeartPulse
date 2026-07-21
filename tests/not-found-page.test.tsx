import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import NotFoundPage from '../src/features/NotFoundPage';

const html = renderToStaticMarkup(<NotFoundPage navigatePath={() => {}} />);

assert.match(html, /class="not-found-page"/);
assert.match(html, /<h1 id="not-found-title">Страница не найдена<\/h1>/);
assert.match(html, /aria-labelledby="not-found-title"/);
for (const href of ['/', '/articles', '/standard/cards']) {
  assert.match(html, new RegExp(`href="${href.replace('/', '\\/')}"`), `${href} recovery link must be present`);
}

console.log('not-found page render assertions passed');
