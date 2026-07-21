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

const unavailableHtml = renderToStaticMarkup(
  <NotFoundPage state="unavailable" navigatePath={() => {}} />,
);
assert.match(unavailableHtml, /role="alert"/);
assert.match(unavailableHtml, /<h1 id="route-unavailable-title">Не удалось открыть страницу<\/h1>/);
assert.match(unavailableHtml, /<button[^>]*>.*Обновить страницу.*<\/button>/);
assert.doesNotMatch(unavailableHtml, /href=/, 'a route-policy failure must not offer navigation through an unverified route table');

console.log('not-found page render assertions passed');
