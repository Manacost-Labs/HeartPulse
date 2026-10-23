import assert from 'node:assert/strict';
import { isLocalRevalidateRequest } from '../apps/public-web/lib/localRevalidateRequest.js';

const headers = (values: Record<string, string>) => new Headers(values);

assert.equal(isLocalRevalidateRequest(headers({ host: '127.0.0.1:4321', 'x-forwarded-for': '127.0.0.1' })), true,
  'the post-deploy call on the host is accepted');
assert.equal(isLocalRevalidateRequest(headers({ host: 'localhost:4321', 'x-forwarded-for': '::ffff:127.0.0.1' })), true);
assert.equal(isLocalRevalidateRequest(headers({ host: 'hearthpulse.net', 'x-forwarded-for': '127.0.0.1' })), false,
  'Nginx sends the public Host');
assert.equal(isLocalRevalidateRequest(headers({ host: '127.0.0.1:4321', 'x-forwarded-for': '203.0.113.7' })), false,
  'a visitor address forwarded by Nginx is refused');
assert.equal(isLocalRevalidateRequest(headers({ host: '127.0.0.1:4321', 'x-forwarded-for': '127.0.0.1, 203.0.113.7' })), false,
  'a forged loopback value that Nginx extended is refused');
assert.equal(isLocalRevalidateRequest(headers({ host: '127.0.0.1:4321' })), false, 'no forwarded address, no regeneration');

console.log('local revalidate request contracts passed');
