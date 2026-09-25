import assert from 'node:assert/strict';
import { publicGuideTeaser } from '../apps/public-web/lib/publicGuideTeaserData';

const raw = {
  slug: 'arena-100-percent', title: 'Арена 100% побед',
  description: 'Описание', image: '/images/arena.png',
  publishedAt: '2026-07-10T12:00:00.000Z', kind: 'Гайды',
  kindSlug: 'guides', menuName: 'Арена',
  contentHtml: 'PRIVATE_CONTENT', sourceUrl: 'PRIVATE_SOURCE',
};
const teaser = publicGuideTeaser(raw, 'arena-100-percent');
assert.deepEqual(teaser, {
  slug: 'arena-100-percent', title: 'Арена 100% побед',
  description: 'Описание', image: '/images/arena.png',
  publishedAt: '2026-07-10T12:00:00.000Z', kind: 'Гайды',
  kindSlug: 'guides', menuName: 'Арена',
});
assert.equal(JSON.stringify(teaser).includes('PRIVATE_'), false);
assert.equal(publicGuideTeaser(raw, '1').slug, 'arena-100-percent');
assert.throws(() => publicGuideTeaser(raw, 'different'), /Invalid/);
assert.throws(() => publicGuideTeaser({ ...raw, image: 'javascript:alert(1)' }, 'arena-100-percent'), /Invalid/);
