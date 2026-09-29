import assert from 'node:assert/strict';
import test from 'node:test';
import { searchParamsQuery, seoPageMetadata } from '../apps/public-web/lib/seoPageMetadata';

test('registry pages get self-canonical, indexable metadata with share cards', async () => {
  const metadata = await seoPageMetadata('/legendaries', 'HearthPulse — легендарки Арены')(
    { searchParams: Promise.resolve({}) },
  );
  assert.deepEqual(metadata.alternates, { canonical: 'https://hearthpulse.net/legendaries/' });
  assert.deepEqual(metadata.robots, { index: true, follow: true });
  assert.equal((metadata.openGraph as { url?: string }).url, 'https://hearthpulse.net/legendaries/');
  assert.deepEqual((metadata.openGraph as { images?: unknown }).images, [
    { url: '/assets/og-preview.png', alt: 'HearthPulse — легендарки Арены', width: 1200, height: 630 },
  ]);
});

test('the home page canonical keeps the bare origin', async () => {
  const metadata = await seoPageMetadata('/', 'HearthPulse — Hearthstone')({ searchParams: Promise.resolve({}) });
  assert.deepEqual(metadata.alternates, { canonical: 'https://hearthpulse.net/' });
});

test('filtered listings stay followable but are not indexed', async () => {
  const metadata = await seoPageMetadata('/articles', 'HearthPulse — статьи Hearthstone')(
    { searchParams: Promise.resolve({ page: '2' }) },
  );
  assert.deepEqual(metadata.robots, { index: false, follow: true });
  assert.deepEqual(metadata.alternates, { canonical: 'https://hearthpulse.net/articles/' });
});

test('an unregistered page fails when its module loads', () => {
  assert.throws(() => seoPageMetadata('/not-registered', 'alt'), /Missing SEO contract for \/not-registered/);
});

test('search params keep request order and repeated values', () => {
  assert.equal(searchParamsQuery({ q: 'mage', class: ['druid', 'hunter'], empty: undefined }),
    'q=mage&class=druid&class=hunter');
});
