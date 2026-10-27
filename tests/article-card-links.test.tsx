import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import type { Article } from '../src/modules/articles/public';

const styles = registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier.endsWith('.css')
    ? { url: 'data:text/javascript,export{}', shortCircuit: true }
    : nextResolve(specifier, context);
} });
const { ArticlesTab } = await import('../src/modules/articles/public');
styles.deregister();

const article = (id: string, url: string): Article => ({
  id, url, title: `Статья ${id}`, date: '2026-09-30', image: '/cover.png', excerpt: '', tag: 'Арена',
});
const html = renderToStaticMarkup(
  <ArticlesTab data={{ articles: [
    article('open', 'https://example.test/open/'),
    article('vip', 'https://kolodahearthstone.com/vip/'),
    article('broken', '#'),
  ], updatedAt: null }} loading={false} onNavigate={() => undefined} />,
);
const cards = [...html.matchAll(/<article [^>]*>([\s\S]*?)<\/article>/g)].map(match => match[1]);
assert.equal(cards.length, 3);

// Crawlers follow only real links: every card with a public URL renders one,
// the VIP card included (its click still goes through the access flow).
for (const [card, href] of [[cards[0], 'https://example.test/open/'], [cards[1], 'https://kolodahearthstone.com/vip/']]) {
  const link = card.match(/^<a ([^>]*)>/)?.[1] ?? '';
  assert.match(link, new RegExp(`href="${href}"`), 'the card target is a real link to the article');
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener"/);
  assert.match(link, /aria-label="Читать статью: Статья /);
}
assert.doesNotMatch(cards[2], /<a |href=/, 'a card without a public URL links nowhere');
assert.doesNotMatch(cards[2].split('article-vote-row')[0], /<button/, 'and is not a fake button either');

console.log('article card link tests passed');
