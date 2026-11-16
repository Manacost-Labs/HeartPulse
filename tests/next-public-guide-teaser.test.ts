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
