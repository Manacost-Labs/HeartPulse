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

const sanitized = sanitizer.sanitizeHtml(`
  <script>alert('xss')</script>
  <p class="legacy" style="position:fixed" onclick="steal()">Текст</p>
  <p><img data-src="/images/card.png" width="500" height="900" style="float:left" alt="Карта &quot;A&quot;"></p>
  <a href="javascript:alert(1)" onmouseover="steal()">опасная ссылка</a>
  <a href="/guides/next">следующий гайд</a>
`);

assert.doesNotMatch(sanitized, /script|onclick|onmouseover|style=|class=|width=|height=/i);
assert.match(sanitized, /<p>Текст<\/p>/);
assert.match(sanitized, /<figure><img src="https:\/\/legacy\.example\.test\/images\/card\.png"/);
assert.match(sanitized, /loading="lazy" decoding="async"/);
assert.match(sanitized, /<a>опасная ссылка<\/a>/);
assert.match(sanitized, /href="https:\/\/legacy\.example\.test\/guides\/next"/);

assert.equal(
  sanitizer.sanitizeHtml('<img src="/separations/divider.png"><img src="/subpage-body-bg.png">'),
  '',
);

console.log('guide archive sanitizer tests passed');
