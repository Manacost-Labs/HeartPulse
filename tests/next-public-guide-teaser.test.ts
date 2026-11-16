import assert from 'node:assert/strict';
import { publicGuideTeaser } from '../apps/public-web/lib/publicGuideTeaserData';

const raw = {
  slug: 'arena-100-percent', title: 'Арена 100% побед',
  description: 'Описание', image: '/images/arena.png',
  publishedAt: '2026-07-10T12:00:00.000Z', kind: 'Гайды',
  kindSlug: 'guides', menuName: 'Арена',
  contentHtml: 'PRIVATE_CONTENT', sourceUrl: 'PRIVATE_SOURCE', bodyHtml: 'PRIVATE_BODY',
};
// A server that does not send the open part yet: no text, not indexed.
assert.deepEqual({ ...publicGuideTeaser(raw, 'arena-100-percent'), slug: '', title: '', description: '' }, {
  slug: '', title: '', description: '', image: '/images/arena.png', publishedAt: '2026-07-10T12:00:00.000Z',
  kind: 'Гайды', kindSlug: 'guides', menuName: 'Арена', updatedAt: null, excerptHtml: '', toc: [], hasPaid: true, indexable: false,
});
const open = {
  updatedAt: '2026-07-10T12:00:00.000Z', excerptHtml: '<p>Открытый текст.</p>',
  toc: [{ id: 'guide-heading-1', text: 'Раздел', level: 2 }], hasPaid: false, indexable: true,
};
const teaser = publicGuideTeaser({ ...raw, ...open }, 'arena-100-percent');
assert.deepEqual(teaser, {
  slug: 'arena-100-percent', title: 'Арена 100% побед',
  description: 'Описание', image: '/images/arena.png',
  publishedAt: '2026-07-10T12:00:00.000Z', kind: 'Гайды',
  kindSlug: 'guides', menuName: 'Арена', ...open,
});
assert.equal(JSON.stringify(teaser).includes('PRIVATE_'), false);
assert.equal(publicGuideTeaser(raw, '1').slug, 'arena-100-percent');
assert.throws(() => publicGuideTeaser({ ...raw, toc: [{ id: 'a b', text: 'x', level: 2 }] }, 'arena-100-percent'), /Invalid/);
assert.throws(() => publicGuideTeaser(raw, 'different'), /Invalid/);
assert.throws(() => publicGuideTeaser({ ...raw, image: 'javascript:alert(1)' }, 'arena-100-percent'), /Invalid/);

// The sanitizer's own output must pass: external links carry rel="noopener noreferrer", icons a two-word alt.
{
  const { createOldGuideSanitizer } = await import('../server/guides/sanitize.js');
  const { buildGuideExcerpt } = await import('../server/guides/excerpt.js');
  const sanitized = createOldGuideSanitizer('https://legacy.example.test').sanitizeHtml(
    '<p>Смотрите <a href="https://example.com/a?x=1&y=2">внешнюю ссылку</a>, <a href="/guides/next">гайд</a> и '
    + '<img width="20" src="/design/user/mana.png" alt="Mana icon > 3 &quot;x&quot;"> иконку.</p>');
  assert.match(sanitized, /rel="noopener noreferrer"/);
  const excerpt = buildGuideExcerpt(sanitized).html;
  assert.match(excerpt, /alt="Mana icon/);
  assert.equal(publicGuideTeaser({ ...raw, excerptHtml: excerpt }, 'arena-100-percent').excerptHtml, excerpt);
}
for (const bad of ['<script>x</script>', '<scr<script>ipt>x</scr</script>ipt>', 'a < b', '<p', '<p onclick="x">a</p>',
  '<a href="javascript:x">a</a>', '<img src="//evil.test/a.png">', '<img src="data:image/png;base64,AA==">',
  '<p title="a">a</p>', '<p id="x>y">a</p><p onclick="z">']) {
  assert.throws(() => publicGuideTeaser({ ...raw, excerptHtml: bad }, 'arena-100-percent'), /Invalid/, bad);
}
