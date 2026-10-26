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
