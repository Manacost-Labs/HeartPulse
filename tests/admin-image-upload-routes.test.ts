import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import {
  createAdminImageUploadRouter,
  decodeAdminImageDataUrl,
  writeAdminImageAtomically,
} from '../server/adminImageUploadRoutes.js';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const dataUrl = `data:image/jpeg;base64,${png.toString('base64')}`;
assert.deepEqual(decodeAdminImageDataUrl(dataUrl), png, 'the binary signature, not the declared MIME, owns format detection');
assert.equal(decodeAdminImageDataUrl('data:image/png;base64,%%%%'), null);

const root = await mkdtemp(join(tmpdir(), 'admin-image-upload-'));
const publicDir = join(root, 'public');
const sourceDir = join(root, 'source');
let transformMode: 'ok' | 'large' | 'failure' = 'ok';
let transformCalls = 0;
const fetchedUrls: string[] = [];
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api', createAdminImageUploadRouter({
  adminAuth: request => request.headers['x-test-role'] === 'admin' ? { id: 'admin' } : null,
  contestAdminAuth: request => request.headers['x-test-role'] === 'contest' ? { id: 'contest' } : null,
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  publicDir,
  sourceDir,
  maxBytes: 64,
  maxPixels: 100,
  maxWidth: 10,
  maxHeight: 10,
  createFileName: () => 'fixed-upload.webp',
  transform: async () => {
    transformCalls += 1;
    if (transformMode === 'failure') throw new Error('secret sharp storage path');
    return { output: Buffer.from('webp-output'), width: transformMode === 'large' ? 11 : 5, height: 5, pages: 1 };
  },
  fetchRemoteImage: async url => {
    fetchedUrls.push(url);
    return png;
  },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const post = (body: object, role = '') => fetch(`http://127.0.0.1:${address.port}/api/admin/uploads/image`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(role ? { 'X-Test-Role': role } : {}) },
  body: JSON.stringify(body),
});

try {
  const forbidden = await post({ dataUrl });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('cache-control'), 'private, no-store');
  assert.equal(transformCalls, 0);

  assert.equal((await post({ dataUrl: 'invalid' }, 'admin')).status, 400);
  assert.equal((await post({ dataUrl: `data:image/png;base64,${Buffer.alloc(65, 1).toString('base64')}` }, 'admin')).status, 413);
  assert.equal((await post({ dataUrl: `data:image/png;base64,${Buffer.from('not an image').toString('base64')}` }, 'admin')).status, 415);
  assert.equal(transformCalls, 0);

  transformMode = 'large';
  assert.equal((await post({ dataUrl }, 'admin')).status, 413);
  assert.equal((await readdir(publicDir).catch(() => [])).length, 0);

  transformMode = 'ok';
  const remoteUpload = await post({ sourceUrl: 'https://images.example.test/cover.png' }, 'admin');
  assert.equal(remoteUpload.status, 200);
  assert.deepEqual(await remoteUpload.json(), { success: true, url: '/uploads/admin/fixed-upload.webp' });
  assert.deepEqual(fetchedUrls, ['https://images.example.test/cover.png']);

  const contestUpload = await post({ dataUrl }, 'contest');
  assert.equal(contestUpload.status, 200);
  assert.equal(contestUpload.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await contestUpload.json(), { success: true, url: '/uploads/admin/fixed-upload.webp' });
  assert.equal((await readFile(join(publicDir, 'fixed-upload.webp'))).toString(), 'webp-output');
  assert.equal((await readFile(join(sourceDir, 'fixed-upload.webp'))).toString(), 'webp-output');

  await rm(publicDir, { recursive: true, force: true });
  await rm(sourceDir, { recursive: true, force: true });
  transformMode = 'failure';
  const failure = await post({ dataUrl }, 'admin');
  assert.equal(failure.status, 500);
  assert.deepEqual(await failure.json(), { error: 'Не удалось обработать изображение' });

  const files = new Set<string>();
  let renameCount = 0;
  const fakeOperations = {
    mkdir: async () => undefined,
    writeFile: async (path: string) => { files.add(path); },
    chmod: async () => undefined,
    rename: async (from: string, to: string) => {
      renameCount += 1;
      if (renameCount === 2) throw new Error('disk full');
      files.delete(from); files.add(to);
    },
    unlink: async (path: string) => { files.delete(path); },
  } as any;
  await assert.rejects(
    writeAdminImageAtomically('/public', '/source', 'atomic.webp', Buffer.from('x'), fakeOperations),
    /disk full/,
  );
  assert.equal(files.size, 0, 'partial publication and temporary files must be removed after failure');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await rm(root, { recursive: true, force: true });
}

console.log('admin image upload route tests passed');
