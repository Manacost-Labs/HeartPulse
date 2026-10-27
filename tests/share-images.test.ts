import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import sharp from 'sharp';
import {
  SHARE_IMAGE_HEIGHT, SHARE_IMAGE_SECTIONS, SHARE_IMAGE_WIDTH,
  shareImagePath, shareImageSectionForPath, shareImageUrl,
} from '../shared/shareImages';

const SECTION_OF_PATH: Record<string, string> = {
  '/': 'default',
  '/faq': 'default',
  '/cosmetics/heroes': 'default',
  '/standard/meta': 'standard',
  '/standard/archetypes/standard/aggro-paladin/': 'standard',
  '/archetypes/wild': 'standard',
  '/battlegrounds/tier-list/': 'battlegrounds',
  '/heroes/12345': 'battlegrounds',
  '/library/minions': 'battlegrounds',
  '/tierlist': 'arena',
  '/classes': 'arena',
  '/legendaries': 'arena',
  '/leaderboards': 'leaderboards',
  '/articles': 'articles',
  '/guides-archive/some-guide': 'articles',
  // A shared prefix is not a section: only whole path segments match.
  '/heroesque': 'default',
};
for (const [path, section] of Object.entries(SECTION_OF_PATH)) {
  assert.equal(shareImageSectionForPath(path), section, path);
}

// Messengers cache previews by URL, so every URL carries the render version.
assert.match(shareImagePath(), /^\/assets\/og\/hearthpulse-default\.png\?v=\d{8}$/);
assert.equal(shareImageUrl('arena', 'https://example.test/'),
  `https://example.test${shareImagePath('arena')}`);

for (const section of SHARE_IMAGE_SECTIONS) {
  const file = `public/assets/og/hearthpulse-${section}.png`;
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.format, 'png', file);
  assert.deepEqual([metadata.width, metadata.height], [SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT], file);
  assert.ok(statSync(file).size <= 300 * 1024, `${file} must stay within the 300 KiB preview budget`);
}
