import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  collectConstructedCardDbfIds,
  syncConstructedCardThumbnails,
} from '../server/constructedCardImagePrewarmer.js';

const root = await mkdtemp(join(tmpdir(), 'hs-arena-card-prewarm-'));

try {
  const cacheDir = join(root, 'card-images');
  const tinyCard = await sharp({
    create: {
      width: 20,
      height: 30,
      channels: 4,
      background: { r: 70, g: 120, b: 190, alpha: 1 },
    },
  }).png().toBuffer();
  const urls = new Map<number, string>([
    [101, 'https://example.test/cards/aaa.png'],
    [202, 'https://example.test/cards/bbb.png'],
  ]);
  const downloads: string[] = [];
  const getImageUrl = async (dbfId: number) => urls.get(dbfId) ?? null;
  const downloadImage = async (url: string) => {
    downloads.push(url);
    return tinyCard;
  };

  assert.deepEqual(
    collectConstructedCardDbfIds([
      [{ dbf: 202 }, { dbf: 101 }, { dbf: 101 }, { dbf: 0 }, { dbf: 'bad' }],
      [{ dbf: 303 }, null],
    ]),
    [101, 202, 303],
    'catalog IDs should be positive, unique, and deterministic',
  );

  const first = await syncConstructedCardThumbnails({
    dbfIds: [101, 202],
    cacheDir,
    getImageUrl,
    downloadImage,
    concurrency: 2,
    now: () => new Date('2026-07-27T12:00:00.000Z'),
  });
  assert.deepEqual(
    { updated: first.updated, skipped: first.skipped, missing: first.missing, failed: first.failed },
    { updated: 2, skipped: 0, missing: 0, failed: 0 },
  );
  assert.equal(downloads.length, 2);
  await stat(join(cacheDir, '101-thumb-blizzard-card_img_v6_blizzard.webp'));
  await stat(join(cacheDir, '202-thumb-blizzard-card_img_v6_blizzard.webp'));
  await stat(join(cacheDir, '101-full-blizzard-card_img_v6_blizzard.webp'));
  await stat(join(cacheDir, '202-full-blizzard-card_img_v6_blizzard.webp'));

  const manifestPath = join(cacheDir, 'blizzard-thumbnails-manifest-v1.json');
  const legacyManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete legacyManifest.cards['101'].cacheFiles;
  await writeFile(manifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`);

  const second = await syncConstructedCardThumbnails({
    dbfIds: [101, 202],
    cacheDir,
    getImageUrl,
    downloadImage,
    concurrency: 2,
    now: () => new Date('2026-07-28T12:00:00.000Z'),
  });
  assert.deepEqual(
    { updated: second.updated, skipped: second.skipped, failed: second.failed },
    { updated: 0, skipped: 2, failed: 0 },
    'an unchanged catalog should not redownload existing thumbnails',
  );
  assert.equal(downloads.length, 2);

  urls.set(202, 'https://example.test/cards/bbb-v2.png');
  const third = await syncConstructedCardThumbnails({
    dbfIds: [101, 202],
    cacheDir,
    getImageUrl,
    downloadImage,
    concurrency: 2,
    now: () => new Date('2026-07-29T12:00:00.000Z'),
  });
  assert.deepEqual(
    { updated: third.updated, skipped: third.skipped, failed: third.failed },
    { updated: 1, skipped: 1, failed: 0 },
    'only a card whose official source URL changed should be refreshed',
  );
  assert.equal(downloads.at(-1), 'https://example.test/cards/bbb-v2.png');

  const manifest = JSON.parse(await readFile(
    manifestPath,
    'utf8',
  ));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.cards['101'].sourceUrl, urls.get(101));
  assert.equal(manifest.cards['101'].cacheFiles.thumb, '101-thumb-blizzard-card_img_v6_blizzard.webp');
  assert.equal(manifest.cards['101'].cacheFiles.full, '101-full-blizzard-card_img_v6_blizzard.webp');
  assert.equal(manifest.cards['101'].updatedAt, '2026-07-27T12:00:00.000Z');
  assert.equal(manifest.cards['202'].sourceUrl, urls.get(202));
  assert.equal(manifest.cards['202'].updatedAt, '2026-07-29T12:00:00.000Z');
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('constructed card image prewarmer tests passed');
