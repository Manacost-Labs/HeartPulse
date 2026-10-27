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
  // WHATWG URL rewrites an embedded IPv4 into hex hextets: [::ffff:127.0.0.1] becomes [::ffff:7f00:1].
  'http://[::ffff:127.0.0.1]/image.png',
  'http://[0:0:0:0:0:ffff:7f00:1]/image.png',
  'http://[::ffff:169.254.169.254]/image.png',
  'http://[::127.0.0.1]/image.png',
  'http://[::ffff:0:10.0.0.1]/image.png',
  'http://[64:ff9b::7f00:1]/image.png',
  'http://[2002:7f00:1::]/image.png',
  'http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/image.png',
  'http://[fec0::1]/image.png',
]) {
  fetched = [];
  await assert.rejects(
    fetchRemoteAdminImage(value, { maxBytes: 1024, fetchImpl, resolveHost: publicResolver }),
    (error: unknown) => error instanceof RemoteAdminImageError && error.status === 400,
    value,
  );
  assert.deepEqual(fetched, [], `${value} must be rejected before the request`);
}

// A resolver may also answer with the hex spelling of a mapped loopback or private address.
for (const address of ['::ffff:7f00:1', '::ffff:a00:5', '64:ff9b::a9fe:a9fe']) {
  await assert.rejects(
    fetchRemoteAdminImage('https://rebound.example.test/image.png', { maxBytes: 1024, fetchImpl, resolveHost: async () => [address] }),
    (error: unknown) => error instanceof RemoteAdminImageError && error.status === 400,
    address,
  );
}

// 192.0.0.0/24 and 192.0.2.0/24 are reserved, the rest of 192.0.0.0/16 is public (i0.wp.com is 192.0.77.2).
for (const address of ['192.0.0.8', '192.0.2.10']) {
  await assert.rejects(
    fetchRemoteAdminImage('https://reserved.example.test/image.png', { maxBytes: 1024, fetchImpl, resolveHost: async () => [address] }),
    (error: unknown) => error instanceof RemoteAdminImageError && error.status === 400,
    address,
  );
}

for (const address of ['2606:4700:4700::1111', '::ffff:5db8:d822', '192.0.77.2']) {
  fetched = [];
  await fetchRemoteAdminImage('https://images.example.test/image.png', { maxBytes: 1024, fetchImpl, resolveHost: async () => [address] });
  assert.equal(fetched.length, 1, `${address} is a public address`);
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
