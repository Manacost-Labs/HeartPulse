import assert from 'node:assert/strict';
import { createOldGuideSanitizer } from '../server/guides/sanitize.js';

const sanitizer = createOldGuideSanitizer('https://legacy.example.test/');

assert.equal(
  sanitizer.normalizeAssetUrl('/images/card.png'),
  'https://legacy.example.test/images/card.png',
);
assert.equal(
  sanitizer.normalizeLink('guides/example'),
  'https://legacy.example.test/guides/example',
);
assert.equal(sanitizer.normalizeLink('javascript:alert(1)'), '#');
assert.equal(sanitizer.normalizeAssetUrl('data:text/html,unsafe'), '');
assert.equal(sanitizer.normalizeAssetUrl('http://kolodahearthstone.ru/design/user/deck.jpg'),
  'https://legacy.example.test/design/user/deck.jpg');

const sanitized = sanitizer.sanitizeHtml(`
  <script>alert('xss')</script>
  <p class="legacy" style="position:fixed" onclick="steal()">Текст</p>
  <p><img data-src="/images/card.png" width="500" height="900" style="float:left" alt="Карта &quot;A&quot;"></p>
  <a href="javascript:alert(1)" onmouseover="steal()">опасная ссылка</a>
  <a href="/guides/next">следующий гайд</a>
`);

assert.doesNotMatch(sanitized, /script|onclick|onmouseover|style=|class=|width=|height=/i);
assert.match(sanitized, /<p>Текст<\/p>/);
assert.match(sanitized, /<img src="https:\/\/legacy\.example\.test\/images\/card\.png"/);
assert.match(sanitized, /loading="lazy" decoding="async"/);
assert.match(sanitized, /<a>опасная ссылка<\/a>/);
assert.match(sanitized, /href="https:\/\/legacy\.example\.test\/guides\/next"/);

assert.equal(
  sanitizer.sanitizeHtml('<img src="/separations/divider.png"><img src="/subpage-body-bg.png">'),
  '',
);

const mulligan = sanitizer.sanitizeHtml(`
  <p><em><img style="margin:5px;float:left;width:10px" src="/design/user/bolt.png"></em><strong>Амирдрассил</strong> — оставляйте всегда.</p>
  <p><img src="/design/user/bolt%2021.png"><strong>Озарение</strong> — одну копию.</p>
  <p><img src="/design/user/fire.png">Стратегия</p>
  <p><img src="/design/user/bolt-win.png">Победа</p>
  <p>&nbsp;<em> </em><br></p>
  <p><a href="/deck.jpg"><img src="/deck.jpg"></a></p>
`);
assert.doesNotMatch(mulligan, /bolt|fire\.png|<figure>|<em>\s*<\/em>/);
assert.match(mulligan, /<p><strong>Амирдрассил<\/strong> — оставляйте всегда\.<\/p>/);
assert.match(mulligan, /<p><a[^>]+><img[^>]+><\/a><\/p>/);
assert.doesNotMatch(mulligan, /<p>\s*(?:&nbsp;|<br\s*\/?>)*\s*<\/p>/);

const navigation = sanitizer.sanitizeHtml('<p><a id="100" name="100"></a><a href="#1">Муллиган</a></p><h2><a name="1"></a>Муллиган</h2><a href="#100">К оглавлению</a>');
assert.match(navigation, /id="guide-section-1"/);
assert.match(navigation, /href="#guide-section-1"/);
assert.doesNotMatch(navigation, /target="_blank"/);

const deckCode = 'AAECAZICBqqBB+KBB5KDB/KDB6+HB6yIBw==';
assert.match(sanitizer.sanitizeHtml(`<p><img data-clipboard-text="${deckCode}" src="/design/user/kod6.png"></p>`), /AAECAZICBqqBB\+KBB5KDB\/KDB6\+HB6yIBw==/);
assert.doesNotMatch(sanitizer.sanitizeHtml('<a href="java&#x73;cript:alert(1)">Текст</a><img src="x" onerror="alert(1)">'), /javascript:|onerror/);
assert.match(sanitizer.sanitizeHtml('<a href="/large.jpg"><img src="/small.jpg" alt=""></a>'), /alt="Иллюстрация к гайду"/);
assert.equal(sanitizer.sanitizeHtml('<a href="/old"><img src="/design/user/bolt.png"></a>'), '');

console.log('guide archive sanitizer tests passed');

// Open part of a guide: where the cut falls and what it leaves out.
{
  const { addGuideHeadingIds, buildGuideExcerpt, guideToc } = await import('../server/guides/excerpt.js');
  const { countWords, words } = await import('./helpers/guideExcerptFixture.js');

  const wrapped = buildGuideExcerpt(`<div><p>${words(160, 'a')}</p><p>${words(20, 'b')}</p></div>`);
  assert.equal(wrapped.html, `<div><p>${words(160, 'a')}</p></div>`, 'cut at a paragraph; the wrapper is closed');
  assert.equal(wrapped.hasPaid, true);

  // The first block longer than 200 words is cut at a sentence.
  const sentence = buildGuideExcerpt(`<p>${words(300, 'c')}</p>`);
  assert.equal(countWords(sentence.html), 200);
  assert.ok(sentence.html.endsWith('c199.</p>'));

  // No sentence ends in the range: the cut is at a word, marked with an ellipsis.
  const unpunctuated = buildGuideExcerpt(`<p>${Array.from({ length: 250 }, (_, i) => `w${i}`).join(' ')}</p>`);
  assert.equal(unpunctuated.words, 200);
  assert.ok(unpunctuated.html.endsWith('w199…</p>'));

  // A heading is never cut in half: the open part ends before it.
  const heading = buildGuideExcerpt(`<p>${words(100, 'd')}</p><h2>${Array.from({ length: 120 }, (_, i) => `h${i}`).join(' ')}</h2>`);
  assert.equal(heading.html, `<p>${words(100, 'd')}</p>`);

  // Deck pictures, deck codes and figures are the paid part; small inline icons stay.
  const media = buildGuideExcerpt('<p>Текст <img class="guide-inline-image" src="https://x.test/i.png" alt="i"></p>'
    + '<figure><img src="https://x.test/deck.png" alt="d"><figcaption>Колода</figcaption></figure>'
    + '<p><code class="guide-deck-code">AAEBAZICAA8PAAAAAAAAAA==</code></p>');
  assert.equal(media.html, '<p>Текст <img class="guide-inline-image" src="https://x.test/i.png" alt="i"></p>');
  assert.equal(media.hasPaid, true);
  assert.equal(buildGuideExcerpt('<p>Только текст.</p>').hasPaid, false);

  // A link whose picture was cut leaves neither the link nor the picture's address.
  const linked = buildGuideExcerpt(createOldGuideSanitizer('https://legacy.example.test/').sanitizeHtml(
    '<p>Текст</p><p><a href="/design/user/deck-spoiler.jpg"><img src="/design/user/deck-spoiler.jpg"></a></p>'
    + '<p><a href="https://example.com/x">живая ссылка</a></p>'));
  assert.equal(linked.html.includes('deck-spoiler'), false);
  assert.equal(linked.html, '<p>Текст</p><p><a href="https://example.com/x" target="_blank" rel="noopener noreferrer">живая ссылка</a></p>');
  assert.deepEqual(guideToc(createOldGuideSanitizer('').sanitizeHtml(
    '<h2 id="a">Раздел <img data-clipboard-text="AAEBAZICAA8PAAAAAAAAAA==" title="AAEBAZICAA8PAAAAAAAAAA=="></h2><h3 id="b"><img data-clipboard-text="AAEBAZICAA8PAAAAAAAAAA=="></h3>')),
  [{ id: 'guide-section-a', text: 'Раздел', level: 2 }], 'deck code is not a heading');
  assert.equal(addGuideHeadingIds('<h2>A</h2><h3 id="guide-section-x">B</h3><h3>C</h3>'),
    '<h2 id="guide-heading-1">A</h2><h3 id="guide-section-x">B</h3><h3 id="guide-heading-3">C</h3>');
  assert.deepEqual(guideToc('<h2 id="a">Ловкость &amp; <em>сила</em></h2><p>x</p><h3 id="b"> </h3><h3 id="c">Конец</h3>'), [
    { id: 'a', text: 'Ловкость & сила', level: 2 },
    { id: 'c', text: 'Конец', level: 3 },
  ]);
}
