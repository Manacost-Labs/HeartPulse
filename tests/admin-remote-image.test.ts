import assert from 'node:assert/strict';
import dns from 'node:dns';
import http from 'node:http';
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
for (const address of [
  '::ffff:7f00:1', '::ffff:a00:5', '64:ff9b::a9fe:a9fe',
  '198.51.100.7', '203.0.113.9', '192.88.99.1', '2001:10::1', '2001:20::1', '2001:2::1',
]) {
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

// A redirect is checked like the first hop: a public page cannot hand the importer an internal one.
for (const location of ['http://10.0.0.1/image.png', 'http://127.0.0.1:3001/image.png', 'http://[::ffff:7f00:1]/']) {
  fetched = [];
  await assert.rejects(
    fetchRemoteAdminImage('https://images.example.test/moved.png', {
      maxBytes: 1024,
      resolveHost: publicResolver,
      fetchImpl: async input => {
        fetched.push(String(input));
        return new Response(null, { status: 302, headers: { Location: location } });
      },
    }),
    (error: unknown) => error instanceof RemoteAdminImageError && error.status === 400,
    location,
  );
  assert.deepEqual(fetched, ['https://images.example.test/moved.png'], `${location} must not be requested`);
}

// Bodies the importer does not read are cancelled at once, so their sockets close without waiting for the timeout.
for (const [status, type] of [[302, 'text/html'], [404, 'text/html'], [200, 'text/html']] as const) {
  let cancelled = false;
  await assert.rejects(fetchRemoteAdminImage('https://images.example.test/unread', {
    maxBytes: 1024,
    maxRedirects: 0,
    resolveHost: publicResolver,
    fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      status, headers: { 'Content-Type': type, Location: 'https://images.example.test/next' },
    }),
  }));
  assert.equal(cancelled, true, `HTTP ${status} ${type} body must be cancelled`);
}

// A source that stops sending is reported in Russian, not as a raw TimeoutError.
// AbortSignal.timeout does not keep the event loop alive; a running server does, this interval stands in.
const keepAlive = setInterval(() => {}, 1_000);
await assert.rejects(
  fetchRemoteAdminImage('https://images.example.test/slow.png', {
    maxBytes: 1024,
    timeoutMs: 50,
    resolveHost: publicResolver,
    fetchImpl: async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
      },
    }), { headers: { 'Content-Type': 'image/png' } }),
  }),
  (error: unknown) => error instanceof RemoteAdminImageError && error.status === 504 && /не ответил вовремя/.test(error.message),
);
await assert.rejects(
  fetchRemoteAdminImage('https://slow-dns.example.test/image.png', {
    maxBytes: 1024,
    timeoutMs: 50,
    fetchImpl,
    resolveHost: () => new Promise(() => {}),
  }),
  (error: unknown) => error instanceof RemoteAdminImageError && error.status === 504,
);
clearInterval(keepAlive);

// DNS rebinding: the pre-check sees a public answer, the connection asks again and gets loopback.
// The socket may only use an address that was checked, so the local server must never be reached.
let hits = 0;
const target = http.createServer((_request, response) => {
  hits += 1;
  response.writeHead(200, { 'Content-Type': 'image/png' });
  response.end(png);
});
await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve));
const port = (target.address() as { port: number }).port;
const originalLookup = dns.lookup;
(dns as { lookup: unknown }).lookup = (hostname: string, options: unknown, callback: unknown) => {
  const done = (typeof options === 'function' ? options : callback) as (...args: unknown[]) => void;
  const all = typeof options === 'object' && options !== null && (options as { all?: boolean }).all;
  if (hostname !== 'rebind.example.test') return (originalLookup as (...args: unknown[]) => void)(hostname, options, callback);
  return all ? done(null, [{ address: '127.0.0.1', family: 4 }]) : done(null, '127.0.0.1', 4);
};
try {
  await assert.rejects(
    fetchRemoteAdminImage(`http://rebind.example.test:${port}/image.png`, { maxBytes: 1024, resolveHost: publicResolver }),
    (error: unknown) => error instanceof RemoteAdminImageError && error.status === 400,
  );
  assert.equal(hits, 0, 'the connection must not reach a rebound address');
} finally {
  (dns as { lookup: unknown }).lookup = originalLookup;
  await new Promise<void>(resolve => target.close(() => resolve()));
}

console.log('admin remote image safety tests passed');
