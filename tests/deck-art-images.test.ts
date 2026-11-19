import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { artSquareCrop, createDeckArtImages, type DeckArtFetch } from '../server/deckArtImages.js';

// A 256x256 art padded with white bars above and below a 160-row picture,
// the way HearthstoneJSON serves newer cards.
async function paddedArt(): Promise<Buffer> {
  const band = await sharp({ create: { width: 256, height: 160, channels: 3, background: '#3a5f8a' } }).png().toBuffer();
  return sharp({ create: { width: 256, height: 256, channels: 3, background: '#ffffff' } })
    .composite([{ input: band, top: 48, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

const tilePng = await sharp({ create: { width: 640, height: 128, channels: 4, background: '#6b3f8f' } }).png().toBuffer();
const art = await paddedArt();

{
  const { data, info } = await sharp(art).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual(artSquareCrop(data, info.width, info.height, info.channels), { left: 52, top: 52, size: 152 });
}

{
  const full = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#20304a' } }).raw().toBuffer();
  assert.deepEqual(artSquareCrop(full, 256, 256, 3), { left: 0, top: 0, size: 256 });
}

type Call = string;
function sourceServer(routes: Record<string, { status: number; body?: Buffer; json?: unknown }>) {
  const calls: Call[] = [];
  const fetchStub: DeckArtFetch = async url => {
    calls.push(url);
    const route = routes[url] ?? { status: 404 };
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      json: async () => route.json,
      arrayBuffer: async () => {
        const body = route.body ?? Buffer.alloc(0);
        return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
      },
    };
  };
  return { calls, fetchStub };
}

const cacheDir = mkdtempSync(join(tmpdir(), 'deck-art-'));
try {
  const catalog = 'https://api.kolodahearthstone.com/api/v1';
  const tileUrl = 'https://api.kolodahearthstone.com/uploads/card-tiles/constructed_card/TOY_330t97-abc.png';
  const { calls, fetchStub } = sourceServer({
    [`${catalog}/constructed-cards/TOY_330t97`]: { status: 200, json: { data: { images: { tile: tileUrl } } } },
    [tileUrl]: { status: 200, body: tilePng },
    [`${catalog}/constructed-cards/EVIL_1`]: { status: 200, json: { data: { images: { tile: 'https://evil.example/uploads/x.png' } } } },
    'https://art.test/256x/CORE_EX1_049.jpg': { status: 404 },
    'https://art.test/256x/EX1_049.jpg': { status: 200, body: art },
  });
  let clock = 1_000;
  const images = createDeckArtImages({
    cacheDir,
    catalogBaseUrl: catalog,
    artBaseUrl: 'https://art.test/256x',
    fetch: fetchStub,
    now: () => clock,
    failureTtlMs: 60_000,
  });

  const row = await images.ensure('TOY_330t97', 'row');
  assert.equal(row.source, 'fallback');
  const rowMeta = await sharp(row.path).metadata();
  assert.deepEqual([rowMeta.format, rowMeta.width, rowMeta.height], ['webp', 400, 80]);

  // A cached row is served from disk without another upstream request.
  const before = calls.length;
  assert.equal((await images.ensure('TOY_330t97', 'row')).path, row.path);
  assert.equal(calls.length, before);

  // A Core reprint without its own art falls back to the original card's art, trimmed to a square.
  const portrait = await images.ensure('CORE_EX1_049', 'portrait');
  const portraitMeta = await sharp(portrait.path).metadata();
  assert.deepEqual([portraitMeta.format, portraitMeta.width, portraitMeta.height], ['webp', 96, 96]);
  const corner = await sharp(portrait.path).extract({ left: 0, top: 0, width: 4, height: 4 }).removeAlpha().raw().toBuffer();
  assert.ok(corner[0] < 120 && corner[2] > 90, 'the portrait corner is art, not the white padding');

  // A tile hosted anywhere but the Kolodahs uploads is never fetched.
  await assert.rejects(images.ensure('EVIL_1', 'row'), /no deck tile/);
  assert.equal(calls.includes('https://evil.example/uploads/x.png'), false);

  // A failed card is not requested again until its failure expires.
  const afterFailure = calls.length;
  await assert.rejects(images.ensure('EVIL_1', 'row'), /recently unavailable/);
  assert.equal(calls.length, afterFailure);
  clock += 60_001;
  await assert.rejects(images.ensure('EVIL_1', 'row'), /no deck tile/);
  assert.equal(calls.length, afterFailure + 1);
} finally {
  rmSync(cacheDir, { recursive: true, force: true });
}
