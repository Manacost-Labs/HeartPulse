import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createGalleryRouter } from '../server/galleryRoutes.js';
import { detectAdminUploadFormat } from '../server/imageFormat.js';

const png = readFileSync(join(process.cwd(), 'public', 'favicon-192.png'));
assert.equal(detectAdminUploadFormat(png), 'png');
assert.equal(detectAdminUploadFormat(Buffer.from('not an image')), '');

const root = mkdtempSync(join(tmpdir(), 'hs-arena-gallery-routes.'));
const dataDir = join(root, 'data');
const uploadDir = join(root, 'uploads');

const readData = (filename: string) => {
  const filePath = join(dataDir, filename);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
};

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use('/api', createGalleryRouter({
  dataDir,
  uploadDir,
  uploadMaxBytes: 2 * 1024 * 1024,
  uploadMaxPixels: 2_000_000,
  previewMaxWidth: 256,
  thumbMaxWidth: 128,
  loadData: readData,
  loadDataCached: filename => {
    const data = readData(filename);
    if (!data) return null;
    const body = JSON.stringify(data);
    return { data, etag: `"${createHash('sha256').update(body).digest('hex')}"` };
  },
  invalidateDataCache: () => {},
  sendJsonCached: (request, response, data, etag, cacheHeader) => {
    response.set('Cache-Control', cacheHeader);
    response.set('ETag', etag);
    return request.headers['if-none-match'] === etag ? response.status(304).end() : response.json(data);
  },
  publicCacheHeader: 'public, max-age=300',
  adminGuard: (_request, _response, next) => next(),
  adminAuth: request => request.headers['x-test-admin'] === '1' ? { id: 'admin' } : null,
  setPrivateNoStore: response => response.set('Cache-Control', 'no-store'),
  now: () => new Date('2026-07-12T12:00:00.000Z'),
  createId: () => 'gal_test_item',
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api`;

try {
  const empty = await fetch(`${baseUrl}/gallery`);
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { items: [], updatedAt: null });
  assert.equal(empty.headers.get('cache-control'), 'public, max-age=300');

  const anonymousAdmin = await fetch(`${baseUrl}/admin/gallery`);
  assert.equal(anonymousAdmin.status, 401);
  assert.deepEqual(await anonymousAdmin.json(), { error: 'Требуется вход' });

  const missingTitle = await fetch(`${baseUrl}/admin/gallery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Admin': '1' },
    body: JSON.stringify({ title: '', dataUrl: `data:image/png;base64,${png.toString('base64')}` }),
  });
  assert.equal(missingTitle.status, 400);
  assert.deepEqual(await missingTitle.json(), { error: 'Название обязательно' });

  const invalidFormat = await fetch(`${baseUrl}/admin/gallery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Admin': '1' },
    body: JSON.stringify({ title: 'Bad', dataUrl: `data:image/png;base64,${Buffer.from('not an image payload').toString('base64')}` }),
  });
  assert.equal(invalidFormat.status, 415);

  const created = await fetch(`${baseUrl}/admin/gallery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Admin': '1' },
    body: JSON.stringify({
      title: 'Контрольный арт', description: 'Route contract', tag: 'QA', source: 'test',
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
    }),
  });
  assert.equal(created.status, 200);
  const createdBody = await created.json() as any;
  assert.equal(createdBody.item.id, 'gal_test_item');
  assert.equal(createdBody.item.title, 'Контрольный арт');
  assert.equal(createdBody.item.format, 'png');
  assert.equal(createdBody.item.imageUrl, '/api/gallery/gal_test_item/original');
  assert.ok(existsSync(join(uploadDir, 'gal_test_item.png')));
  assert.ok(existsSync(join(uploadDir, 'gal_test_item-preview.webp')));
  assert.ok(existsSync(join(uploadDir, 'gal_test_item-thumb.webp')));

  const publicList = await fetch(`${baseUrl}/gallery`);
  assert.equal(publicList.status, 200);
  const publicEtag = publicList.headers.get('etag');
  assert.ok(publicEtag);
  assert.equal((await publicList.json() as any).items.length, 1);
  const notModified = await fetch(`${baseUrl}/gallery`, { headers: { 'If-None-Match': publicEtag! } });
  assert.equal(notModified.status, 304);

  const original = await fetch(`${baseUrl}/gallery/gal_test_item/original`);
  assert.equal(original.status, 200);
  assert.equal(original.headers.get('content-type'), 'image/png');
  const imageEtag = original.headers.get('etag');
  assert.ok(imageEtag);
  assert.ok((await original.arrayBuffer()).byteLength > 0);
  const originalNotModified = await fetch(`${baseUrl}/gallery/gal_test_item/original`, { headers: { 'If-None-Match': imageEtag! } });
  assert.equal(originalNotModified.status, 304);

  const download = await fetch(`${baseUrl}/gallery/gal_test_item/download`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition') || '', /^attachment;/);
  await download.arrayBuffer();

  const deleted = await fetch(`${baseUrl}/admin/gallery/gal_test_item`, { method: 'DELETE', headers: { 'X-Test-Admin': '1' } });
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { success: true });
  assert.equal(existsSync(join(uploadDir, 'gal_test_item.png')), false);
  assert.equal((readData('gallery.json') as any).items.length, 0);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  rmSync(root, { recursive: true, force: true });
}

console.log('gallery router contract tests passed');
