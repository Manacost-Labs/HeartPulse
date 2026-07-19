import assert from 'node:assert/strict';
import {
  RemoteAdminImageError,
  fetchRemoteAdminImage,
} from '../server/adminRemoteImage.js';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
let fetched: string[] = [];
const fetchImpl: typeof fetch = async input => {
  fetched.push(String(input));
  return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } });
};

const publicResolver = async () => ['93.184.216.34'];

for (const value of [
  'file:///etc/passwd',
  'https://user:secret@example.test/image.png',
  'http://127.0.0.1/image.png',
  'http://[::1]/image.png',
]) {
  await assert.rejects(
    fetchRemoteAdminImage(value, { maxBytes: 1024, fetchImpl, resolveHost: publicResolver }),
    (error: unknown) => error instanceof RemoteAdminImageError && error.status === 400,
  );
}

fetched = [];
await assert.rejects(
  fetchRemoteAdminImage('https://internal.example.test/image.png', {
    maxBytes: 1024,
    fetchImpl,
    resolveHost: async () => ['10.0.0.5'],
  }),
  (error: unknown) => error instanceof RemoteAdminImageError && error.status === 400,
);
assert.deepEqual(fetched, [], 'private hosts must be rejected before the request');

const image = await fetchRemoteAdminImage('https://images.example.test/image.png', {
  maxBytes: 1024,
  fetchImpl,
  resolveHost: publicResolver,
});
assert.deepEqual(image, png);
assert.deepEqual(fetched, ['https://images.example.test/image.png']);

await assert.rejects(
  fetchRemoteAdminImage('https://images.example.test/not-image', {
    maxBytes: 1024,
    resolveHost: publicResolver,
    fetchImpl: async () => new Response('text', { headers: { 'Content-Type': 'text/plain' } }),
  }),
  (error: unknown) => error instanceof RemoteAdminImageError && error.status === 415,
);

await assert.rejects(
  fetchRemoteAdminImage('https://images.example.test/large.png', {
    maxBytes: 4,
    resolveHost: publicResolver,
    fetchImpl: async () => new Response('12345', { headers: { 'Content-Type': 'image/png' } }),
  }),
  (error: unknown) => error instanceof RemoteAdminImageError && error.status === 413,
);

console.log('admin remote image safety tests passed');
